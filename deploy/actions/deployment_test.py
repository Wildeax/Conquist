import importlib.util
import io
import json
import pathlib
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("images", pathlib.Path(__file__).with_name("validate-images.py"))
images = importlib.util.module_from_spec(spec)
spec.loader.exec_module(images)


class ImageArchiveTests(unittest.TestCase):
    def check_archive(self, manifests, release="a" * 40):
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder) / "images.tar"
            with tarfile.open(path, "w") as archive:
                body = json.dumps(manifests).encode()
                entry = tarfile.TarInfo("manifest.json")
                entry.size = len(body)
                archive.addfile(entry, io.BytesIO(body))
            images.validate(path, release)

    def test_accepts_only_the_exact_release_pair(self):
        self.check_archive([{"RepoTags": ["conquist-web:" + "a" * 40]}, {"RepoTags": ["conquist-rooms:" + "a" * 40]}])

    def test_rejects_unrelated_application_tags(self):
        with self.assertRaises(ValueError):
            self.check_archive([{"RepoTags": ["arena-api:latest"]}, {"RepoTags": ["conquist-rooms:" + "a" * 40]}])

    def test_rejects_additional_aliases_and_wrong_releases(self):
        with self.assertRaises(ValueError):
            self.check_archive([{"RepoTags": ["conquist-web:" + "a" * 40, "conquist-web:latest"]}, {"RepoTags": ["conquist-rooms:" + "a" * 40]}])
        with self.assertRaises(ValueError):
            self.check_archive([{"RepoTags": ["conquist-web:" + "b" * 40]}, {"RepoTags": ["conquist-rooms:" + "a" * 40]}])

    def test_rejects_command_or_path_in_release(self):
        with self.assertRaises(ValueError):
            self.check_archive([], "../../other-app")


if __name__ == "__main__":
    unittest.main()
