from __future__ import annotations

import stat
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from generate_launchers import generate_cash_mcp_launcher, generate_jarvis_launcher


class GenerateLaunchersTests(unittest.TestCase):
    def test_jarvis_launcher_is_executable_and_sets_home(self):
        with tempfile.TemporaryDirectory() as tmp:
            launcher_path = Path(tmp) / "jarvis"
            jarvis_bin = Path(tmp) / "venv" / "bin" / "jarvis"
            generate_jarvis_launcher(
                jarvis_bin, launcher_path=launcher_path, openjarvis_home=Path("/home/user/.openjarvis")
            )
            content = launcher_path.read_text()
            self.assertIn("OPENJARVIS_HOME", content)
            self.assertIn(str(jarvis_bin), content)
            self.assertTrue(launcher_path.stat().st_mode & stat.S_IXUSR)

    def test_cash_mcp_launcher_references_checkout_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            launcher_path = Path(tmp) / "cash-mcp"
            src = Path("/workspaces/repo/runtime/cash-mcp")
            generate_cash_mcp_launcher(src, launcher_path=launcher_path)
            content = launcher_path.read_text()
            self.assertIn(str(src), content)
            self.assertIn("cash_mcp_main", content)
            self.assertTrue(launcher_path.stat().st_mode & stat.S_IXUSR)


if __name__ == "__main__":
    unittest.main()
