import unittest

from cash_cli.main import _walk_storage


class FakeStorageClient:
    def __init__(self):
        self.calls = []
        self.rows = {
            "src-engine-catalog": [
                {"name": "hero.webp", "id": "1"},
                {"name": "engines", "id": None},
            ],
            "src-engine-catalog/engines": [
                {"name": "b58", "id": None},
                {"name": "ls3.webp", "id": "2"},
            ],
            "src-engine-catalog/engines/b58": [
                {"name": "front.webp", "id": "3"},
                {"name": "rear.webp", "id": "4"},
            ],
        }

    def storage_list(self, bucket, prefix="", limit=1000, offset=0):
        self.calls.append((bucket, prefix, limit, offset))
        return list(self.rows.get(prefix, []))


class StorageWalkTests(unittest.TestCase):
    def test_recurses_folder_rows_without_object_ids(self):
        client = FakeStorageClient()
        paths = _walk_storage(
            client,
            "athrty-client-assets",
            "src-engine-catalog",
        )
        self.assertEqual(
            paths,
            [
                "src-engine-catalog/hero.webp",
                "src-engine-catalog/engines/b58/front.webp",
                "src-engine-catalog/engines/b58/rear.webp",
                "src-engine-catalog/engines/ls3.webp",
            ],
        )
        prefixes = [call[1] for call in client.calls]
        self.assertEqual(
            prefixes,
            [
                "src-engine-catalog",
                "src-engine-catalog/engines",
                "src-engine-catalog/engines/b58",
            ],
        )

    def test_normalizes_leading_and_trailing_slashes(self):
        client = FakeStorageClient()
        paths = _walk_storage(
            client,
            "athrty-client-assets",
            "/src-engine-catalog/",
        )
        self.assertEqual(paths[0], "src-engine-catalog/hero.webp")


if __name__ == "__main__":
    unittest.main()
