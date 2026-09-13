"""Inspect docker-save metadata without extracting files onto the VPS."""
import json
import re
import sys
import tarfile


def validate(path, release):
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


if __name__ == "__main__":
    validate(sys.argv[1], sys.argv[2])
