from __future__ import annotations

import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from cash_auth_transport import AuthTransportError, SupabaseUserAuthTransport


class Response:
    def __init__(self, status: int, body: bytes):
        self.status = status
        self._body = body

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def session_payload(user_id="user-1", access="access-token", refresh="refresh-token", expires_at=1999999999):
    return json.dumps(
        {
            "access_token": access,
            "refresh_token": refresh,
            "expires_at": expires_at,
            "user": {"id": user_id},
        }
    ).encode("utf-8")


class RefreshTransportTests(unittest.TestCase):
    def test_refresh_posts_expected_grant_and_headers(self):
        captured = {}

        def opener(request, timeout):
            captured["request"] = request
            captured["timeout"] = timeout
            return Response(200, session_payload())

        transport = SupabaseUserAuthTransport("https://proj.supabase.co", "publishable-key", opener=opener)
        session = transport.refresh("old-refresh")

        self.assertTrue(captured["request"].full_url.endswith("grant_type=refresh_token"))
        self.assertEqual(captured["request"].get_header("Apikey"), "publishable-key")
        self.assertEqual(json.loads(captured["request"].data), {"refresh_token": "old-refresh"})
        self.assertEqual(session, {"user_id": "user-1", "access_token": "access-token", "refresh_token": "refresh-token", "expires_at": 1999999999})

    def test_password_grant_posts_expected_body_and_never_reuses_password_field(self):
        captured = {}

        def opener(request, timeout):
            captured["request"] = request
            return Response(200, session_payload(user_id="user-2"))

        transport = SupabaseUserAuthTransport("https://proj.supabase.co", "key", opener=opener)
        session = transport.password_grant("owner@example.com", "correct horse battery staple")

        self.assertTrue(captured["request"].full_url.endswith("grant_type=password"))
        body = json.loads(captured["request"].data)
        self.assertEqual(body, {"email": "owner@example.com", "password": "correct horse battery staple"})
        self.assertEqual(session["user_id"], "user-2")

    def test_incomplete_session_payload_raises(self):
        def opener(request, timeout):
            return Response(200, json.dumps({"access_token": "a"}).encode("utf-8"))

        transport = SupabaseUserAuthTransport("https://proj.supabase.co", "key", opener=opener)
        with self.assertRaises(AuthTransportError):
            transport.refresh("token")

    def test_http_error_is_wrapped_without_leaking_body_as_message(self):
        def opener(request, timeout):
            raise urllib.error.HTTPError(
                "https://proj.supabase.co", 400, "Bad Request", {},
                io.BytesIO(json.dumps({"error_code": "invalid_grant"}).encode("utf-8")),
            )

        transport = SupabaseUserAuthTransport("https://proj.supabase.co", "key", opener=opener)
        with self.assertRaises(AuthTransportError) as caught:
            transport.refresh("bad-token")
        self.assertEqual(caught.exception.status, 400)
        self.assertEqual(caught.exception.code, "invalid_grant")

    def test_rejects_non_https_url_and_missing_key(self):
        with self.assertRaises(ValueError):
            SupabaseUserAuthTransport("http://proj.supabase.co", "key")
        with self.assertRaises(ValueError):
            SupabaseUserAuthTransport("https://proj.supabase.co", "")


if __name__ == "__main__":
    unittest.main()
