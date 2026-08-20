from __future__ import annotations

import hashlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

from verify_artifact import ArtifactVerificationError, acquire_and_verify, sha256_of, verify_bytes


class VerifyArtifactTests(unittest.TestCase):
    def test_sha256_of_matches_hashlib(self):
        data = b"fixture-bytes"
        self.assertEqual(sha256_of(data), hashlib.sha256(data).hexdigest())

    def test_verify_bytes_passes_on_matching_hash(self):
        data = b"artifact-fixture"
        lock = {"source_artifact_sha256": sha256_of(data)}
        self.assertEqual(verify_bytes(data, lock), lock)

    def test_verify_bytes_raises_on_mismatch(self):
        lock = {"source_artifact_sha256": "0" * 64}
        with self.assertRaises(ArtifactVerificationError):
            verify_bytes(b"tampered", lock)

    def test_acquire_and_verify_writes_only_after_verification(self, tmp_path=None):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "artifact.tar.gz"
            data = b"good-artifact"
            lock = {"source_artifact_sha256": sha256_of(data)}
            acquire_and_verify(dest, lock=lock, downloader=lambda url: data)
            self.assertEqual(dest.read_bytes(), data)

    def test_acquire_and_verify_does_not_write_on_mismatch(self):
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            dest = Path(tmp) / "artifact.tar.gz"
            lock = {"source_artifact_sha256": "f" * 64}
            with self.assertRaises(ArtifactVerificationError):
                acquire_and_verify(dest, lock=lock, downloader=lambda url: b"bad-artifact")
            self.assertFalse(dest.exists())


if __name__ == "__main__":
    unittest.main()
