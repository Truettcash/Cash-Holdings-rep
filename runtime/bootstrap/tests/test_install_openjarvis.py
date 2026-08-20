from __future__ import annotations

import hashlib
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from install_openjarvis import InstallError, install


class FakeResult:
    def __init__(self, returncode=0, stderr=""):
        self.returncode = returncode
        self.stderr = stderr


class InstallOpenJarvisTests(unittest.TestCase):
    def test_install_refuses_non_1_0_3_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(InstallError):
                install(Path(tmp), lock={"version": "2.0.0"})

    def test_install_creates_venv_and_returns_jarvis_script(self):
        data = b"fake-sdist"
        lock = {
            "version": "1.0.3",
            "source_artifact": "openjarvis-1.0.3.tar.gz",
            "source_artifact_sha256": hashlib.sha256(data).hexdigest(),
        }
        calls = []

        def fake_run(cmd, capture_output, text):
            calls.append(cmd)
            if "venv" in cmd:
                venv_dir = Path(cmd[-1])
                (venv_dir / "bin").mkdir(parents=True, exist_ok=True)
                (venv_dir / "bin" / "python").write_text("#!/bin/sh\n")
                (venv_dir / "bin" / "jarvis").write_text("#!/bin/sh\n")
            return FakeResult(0)

        with tempfile.TemporaryDirectory() as tmp:
            prefix = Path(tmp) / "install"
            jarvis_script = install(
                prefix, lock=lock, downloader=lambda url: data, run=fake_run
            )
            self.assertTrue(jarvis_script.name == "jarvis")
            self.assertTrue((prefix / lock["source_artifact"]).exists())
            self.assertTrue(any("pip" in c for c in calls[1]))

    def test_install_fails_when_pip_install_fails(self):
        data = b"fake-sdist"
        lock = {
            "version": "1.0.3",
            "source_artifact": "openjarvis-1.0.3.tar.gz",
            "source_artifact_sha256": hashlib.sha256(data).hexdigest(),
        }

        def fake_run(cmd, capture_output, text):
            if "venv" in cmd:
                venv_dir = Path(cmd[-1])
                (venv_dir / "bin").mkdir(parents=True, exist_ok=True)
                (venv_dir / "bin" / "python").write_text("#!/bin/sh\n")
                return FakeResult(0)
            return FakeResult(1, stderr="boom")

        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(InstallError):
                install(Path(tmp) / "install", lock=lock, downloader=lambda url: data, run=fake_run)


if __name__ == "__main__":
    unittest.main()
