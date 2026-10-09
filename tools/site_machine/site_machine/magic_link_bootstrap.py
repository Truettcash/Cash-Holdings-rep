from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
import re
import stat
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


class MagicLinkBootstrapError(RuntimeError):
    pass


def _load_json(path: Path, label: str) -> dict[str, Any]:
    if not path.is_file():
        raise MagicLinkBootstrapError(f"{label} is missing: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise MagicLinkBootstrapError(f"{label} is unreadable: {path}") from exc
    if not isinstance(value, dict):
        raise MagicLinkBootstrapError(f"{label} must be a JSON object")
    return value


def _post(url: str, key: str, body: dict[str, Any]) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "apikey": key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            raw = response.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:2000]
        raise MagicLinkBootstrapError(
            f"Supabase magic-link request failed ({exc.code}): {detail}"
        ) from exc
    except urllib.error.URLError as exc:
        raise MagicLinkBootstrapError(f"Supabase request failed: {exc.reason}") from exc

    try:
        value = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception as exc:
        raise MagicLinkBootstrapError("Supabase returned invalid JSON") from exc
    return value if isinstance(value, dict) else {}


def _jwt_subject(token: str) -> str:
    parts = token.split(".")
    if len(parts) != 3:
        raise MagicLinkBootstrapError("Magic-link access token is not a JWT")
    payload = parts[1] + ("=" * (-len(parts[1]) % 4))
    try:
        data = json.loads(base64.urlsafe_b64decode(payload.encode("ascii")).decode("utf-8"))
    except Exception as exc:
        raise MagicLinkBootstrapError("Could not decode magic-link access token") from exc
    subject = data.get("sub") if isinstance(data, dict) else None
    if not isinstance(subject, str) or not subject:
        raise MagicLinkBootstrapError("Magic-link access token has no user subject")
    return subject


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _extract_supabase_verify_url(value: str, supabase_url: str) -> str:
    expected = urllib.parse.urlparse(supabase_url)
    host = expected.hostname or ""
    queue = [value.strip()]
    seen: set[str] = set()

    def push(candidate: str) -> None:
        candidate = candidate.strip().strip('"').strip("'")
        if candidate and candidate not in seen and candidate not in queue:
            queue.append(candidate)

    while queue and len(seen) < 120:
        candidate = queue.pop(0)
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)

        # Direct/raw match anywhere in the copied text.
        pattern = rf"https://{re.escape(host)}/auth/v1/verify[^\s<>\"']*"
        match = re.search(pattern, candidate, flags=re.IGNORECASE)
        if match:
            return match.group(0)

        # Repeated URL decoding catches Gmail, SafeLinks, and redirect wrappers.
        decoded = candidate
        for _ in range(8):
            next_value = urllib.parse.unquote(decoded)
            if next_value == decoded:
                break
            decoded = next_value
            push(decoded)
            match = re.search(pattern, decoded, flags=re.IGNORECASE)
            if match:
                return match.group(0)

        try:
            parsed = urllib.parse.urlparse(candidate)
        except Exception:
            parsed = None

        if parsed:
            if (
                parsed.scheme == "https"
                and parsed.hostname == host
                and parsed.path.startswith("/auth/v1/verify")
            ):
                return candidate

            query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
            for values in query.values():
                for item in values:
                    push(item)

            if parsed.fragment:
                push(parsed.fragment)
            if parsed.path:
                push(parsed.path.lstrip("/"))

            # Common tracking providers place the destination after /url/, /redirect/, etc.
            for segment in parsed.path.split("/"):
                push(segment)

        # Some providers encode the destination URL as URL-safe/base64 text.
        compact = candidate.strip()
        for token in re.findall(r"[A-Za-z0-9_-]{24,}={0,2}", compact):
            padded = token + ("=" * (-len(token) % 4))
            try:
                decoded_bytes = base64.urlsafe_b64decode(padded.encode("ascii"))
                decoded_text = decoded_bytes.decode("utf-8")
            except Exception:
                continue
            push(decoded_text)
            match = re.search(pattern, decoded_text, flags=re.IGNORECASE)
            if match:
                return match.group(0)

    raise MagicLinkBootstrapError(
        "Could not recover the Cash Supabase verification URL from the copied link. "
        "Copy the actual href from the newest unused sign-in email, or paste the whole copied button/link text."
    )


def _resolve_magic_link(magic_url: str, supabase_url: str, publishable_key: str) -> str:
    value = magic_url.strip()
    if not value:
        raise MagicLinkBootstrapError("No magic-link URL was provided")

    value = _extract_supabase_verify_url(value, supabase_url)

    opener = urllib.request.build_opener(_NoRedirect)
    req = urllib.request.Request(
        value,
        method="GET",
        headers={"apikey": publishable_key, "Accept": "text/html"},
    )

    try:
        response = opener.open(req, timeout=30)
        location = response.headers.get("Location") or response.geturl()
    except urllib.error.HTTPError as exc:
        if exc.code in (301, 302, 303, 307, 308):
            location = exc.headers.get("Location")
        else:
            detail = exc.read().decode("utf-8", errors="replace")[:2000]
            raise MagicLinkBootstrapError(
                f"Magic-link verification failed ({exc.code}): {detail}"
            ) from exc
    except urllib.error.URLError as exc:
        raise MagicLinkBootstrapError(
            f"Magic-link verification request failed: {exc.reason}"
        ) from exc

    if not location:
        raise MagicLinkBootstrapError(
            "Supabase verified the link but returned no redirect location."
        )
    return urllib.parse.urljoin(value, location)


def _session_from_redirect(redirect_url: str) -> dict[str, Any]:
    value = redirect_url.strip()
    if not value:
        raise MagicLinkBootstrapError("No redirect URL was provided")

    parsed = urllib.parse.urlparse(value)
    query = urllib.parse.parse_qs(parsed.query)
    fragment = urllib.parse.parse_qs(parsed.fragment)

    def one(name: str) -> str:
        values = fragment.get(name) or query.get(name) or []
        return str(values[0]).strip() if values else ""

    error = one("error_description") or one("error")
    if error:
        raise MagicLinkBootstrapError(f"Magic-link redirect returned an error: {error}")

    access_token = one("access_token")
    refresh_token = one("refresh_token")
    expires_in_raw = one("expires_in")

    if not access_token or not refresh_token:
        raise MagicLinkBootstrapError(
            "Supabase did not return an access_token and refresh_token from the magic link."
        )

    try:
        expires_in = int(expires_in_raw or "3600")
    except ValueError:
        expires_in = 3600

    import time

    return {
        "user_id": _jwt_subject(access_token),
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": int(time.time()) + max(60, expires_in),
    }


def _write_session(path: Path, session: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(path.parent, stat.S_IRWXU)
    except OSError:
        pass

    fd, temp_name = tempfile.mkstemp(prefix="session.", suffix=".tmp", dir=path.parent)
    try:
        try:
            os.fchmod(fd, stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(
                {
                    "user_id": session["user_id"],
                    "refresh_token": session["refresh_token"],
                    "expires_at": session["expires_at"],
                },
                handle,
                separators=(",", ":"),
            )
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
        try:
            os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
        except OSError:
            pass
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def bootstrap_magic_link(email: str, state_root: str = "~/.cash-mcp") -> str:
    root = Path(state_root).expanduser()
    config = _load_json(root / "config.json", "Cash MCP config")

    supabase_url = str(
        os.environ.get("CASH_MCP_SUPABASE_URL")
        or config.get("supabase_url")
        or ""
    ).rstrip("/")
    publishable_key = str(
        os.environ.get("CASH_MCP_SUPABASE_PUBLISHABLE_KEY")
        or config.get("publishable_key")
        or ""
    ).strip()

    if not supabase_url or not publishable_key:
        raise MagicLinkBootstrapError(
            "Cash MCP config is missing supabase_url or publishable_key"
        )

    sent_new = True
    try:
        _post(
            f"{supabase_url}/auth/v1/otp",
            publishable_key,
            {
                "email": email,
                "create_user": False,
            },
        )
    except MagicLinkBootstrapError as exc:
        message = str(exc)
        if "429" in message and "over_email_send_rate_limit" in message:
            sent_new = False
        else:
            raise

    print("")
    if sent_new:
        print("Magic link sent.")
    else:
        print("Supabase email rate limit is active.")
        print("No new email was sent. Use the newest UNUSED magic-link email already in your inbox.")
    print("1. Open the newest Supabase sign-in email.")
    print("2. DO NOT click the link.")
    print("3. Right-click the actual sign-in button/link and choose Copy link address.")
    print("4. Paste the copied URL below. Gmail/tracking wrappers are accepted and unwrapped locally.")
    print("")
    magic_url = getpass.getpass(
        "Paste magic-link URL here (hidden so auth material is not echoed): "
    )

    redirect_url = _resolve_magic_link(magic_url, supabase_url, publishable_key)
    session = _session_from_redirect(redirect_url)
    _write_session(root / "session.json", session)
    return str(session["user_id"])


def main() -> None:
    parser = argparse.ArgumentParser(description="Bootstrap Cash MCP with a Supabase magic link")
    parser.add_argument("--email", required=True)
    parser.add_argument("--state-root", default="~/.cash-mcp")
    args = parser.parse_args()

    try:
        user_id = bootstrap_magic_link(args.email, args.state_root)
    except MagicLinkBootstrapError as exc:
        print(f"Magic-link bootstrap failed: {exc}")
        raise SystemExit(1)

    print(f"Cash magic-link session bootstrapped for user: {user_id}")


if __name__ == "__main__":
    main()
