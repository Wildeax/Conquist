"""Check frontend and room-service release identities without creating a match."""
import json
import sys
import time
import urllib.request


def verify(base, release, environment):
    for attempt in range(20):
        try:
            def read(path):
                request = urllib.request.Request(base.rstrip("/") + path, headers={"Cache-Control": "no-cache"})
                with urllib.request.urlopen(request, timeout=10) as response:
                    return json.load(response)
            page = read("/release.json?release=" + release)
            api = read("/api/health")
            if page.get("release") != release or api.get("release") != release:
                raise ValueError("Release mismatch")
            if api.get("environment") != environment or not api.get("ok"):
                raise ValueError("Environment mismatch")
            print("Verified", environment, release, "at", base)
            return
        except Exception as error:
            if attempt == 19:
                raise SystemExit("Release check failed: " + str(error)) from error
            time.sleep(2)


if __name__ == "__main__":
    verify(*sys.argv[1:])
