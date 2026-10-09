from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
from typing import Any

from .capabilities import detect_capabilities
from .client import SiteMachineError

VIEWPORTS = {
    "desktop": (1440, 1100),
    "laptop": (1200, 900),
    "tablet": (768, 1024),
    "mobile": (390, 844),
}


def browser_qa(url: str, output_root: str, viewports: list[str] | None = None) -> dict[str, Any]:
    caps, detail = detect_capabilities()
    if "BROWSER_QA" not in caps:
        raise SiteMachineError("No supported Chrome/Edge browser was detected for browser QA.")

    browsers = detail.get("browsers") or {}
    browser = browsers.get("chrome") or browsers.get("edge")
    if not browser:
        raise SiteMachineError("Browser QA currently requires Chrome or Edge.")

    selected = viewports or list(VIEWPORTS)
    unknown = [name for name in selected if name not in VIEWPORTS]
    if unknown:
        raise SiteMachineError(f"Unknown viewport(s): {', '.join(unknown)}")

    root = Path(output_root)
    root.mkdir(parents=True, exist_ok=True)
    results: list[dict[str, Any]] = []

    for name in selected:
        width, height = VIEWPORTS[name]
        screenshot = root / f"{name}-{width}x{height}.png"
        argv = [
            str(browser),
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--no-first-run",
            "--no-default-browser-check",
            f"--window-size={width},{height}",
            f"--screenshot={screenshot}",
            url,
        ]
        run = subprocess.run(argv, capture_output=True, text=True, timeout=90, shell=False)
        results.append({
            "viewport": name,
            "width": width,
            "height": height,
            "ok": run.returncode == 0 and screenshot.exists(),
            "screenshot": str(screenshot) if screenshot.exists() else None,
            "exitCode": run.returncode,
            "stderr": run.stderr[-2000:],
        })

    report = {
        "url": url,
        "browser": browser,
        "results": results,
        "ok": all(item["ok"] for item in results),
    }
    (root / "qa-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report
