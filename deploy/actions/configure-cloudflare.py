"""Provision the staging DNS record and sign its server-generated CSR."""
import json
import os
import pathlib
import urllib.error
import urllib.request


def main():
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not token:
        raise SystemExit("Add the CLOUDFLARE_API_TOKEN repository secret with DNS Edit and SSL and Certificates Edit for conquist.online.")
    zone = os.environ["CLOUDFLARE_ZONE_ID"]
    origin = os.environ["DEPLOY_HOST"]
    hostname = "staging.conquist.online"

    def api(path, data=None, method=None):
        request = urllib.request.Request(
            "https://api.cloudflare.com/client/v4/" + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                result = json.load(response)
        except urllib.error.HTTPError as error:
            # The endpoint and status are enough to diagnose missing permissions.
            raise SystemExit("Cloudflare request failed with HTTP " + str(error.code) + " at " + path) from error
        if not result.get("success"):
            raise SystemExit("Cloudflare rejected " + path)
        return result["result"]

    records = api("zones/" + zone + "/dns_records?name=" + hostname)
    if records:
        if len(records) != 1 or records[0]["type"] != "A" or records[0]["content"] != origin:
            raise SystemExit("The staging name already points elsewhere; leaving it unchanged.")
        if not records[0]["proxied"]:
            api("zones/" + zone + "/dns_records/" + records[0]["id"], {"proxied": True}, "PATCH")
    else:
        api("zones/" + zone + "/dns_records", {"type": "A", "name": hostname, "content": origin, "proxied": True, "ttl": 1, "comment": "Conquist staging, managed by GitHub Actions"})
    certificate = api("certificates", {
        "csr": os.environ["STAGING_ORIGIN_CSR"],
        "hostnames": [hostname],
        "request_type": "origin-rsa",
        "requested_validity": 730,
    })
    pathlib.Path("staging-origin.crt").write_text(certificate["certificate"])
    print("Configured staging DNS and issued its origin certificate; private key stays on the VPS.")


if __name__ == "__main__":
    main()
