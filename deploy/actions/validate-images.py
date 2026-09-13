"""Inspect docker-save metadata without extracting files onto the VPS."""
import json
import hashlib
import re
import subprocess
import sys
import tarfile


def validate(path, release, check_existing=False):
    if not re.fullmatch(r"[a-f0-9]{40}", release):
        raise ValueError("Invalid release")
    with tarfile.open(path) as archive:
        member = archive.getmember("manifest.json")
        if member.size > 65536 or not member.isfile():
            raise ValueError("Invalid image manifest")
        manifests = json.load(archive.extractfile(member))
        tags = [tag for image in manifests for tag in image.get("RepoTags", [])]
        expected = ["conquist-web:" + release, "conquist-rooms:" + release]
        if len(manifests) != 2 or sorted(tags) != sorted(expected):
            raise ValueError("Archive must contain only the two Conquist release images")
        if check_existing:
            for image in manifests:
                config = archive.getmember(image["Config"])
                if not config.isfile() or config.size > 1048576:
                    raise ValueError("Invalid image configuration")
                image_id = "sha256:" + hashlib.sha256(archive.extractfile(config).read()).hexdigest()
                existing = subprocess.run(["docker", "image", "inspect", image["RepoTags"][0], "--format", "{{.Id}}"], text=True, capture_output=True)
                if existing.returncode == 0 and existing.stdout.strip() != image_id:
                    raise ValueError("This SHA already identifies a different image. Restore the existing release or create a new commit.")


if __name__ == "__main__":
    validate(sys.argv[1], sys.argv[2], check_existing=True)
