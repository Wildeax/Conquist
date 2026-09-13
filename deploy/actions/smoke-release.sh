#!/usr/bin/env bash
# Runs only on the disposable GitHub build runner, before deployment secrets exist.
set -euo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${RUNNER_OS:-}" == Linux ]] || { echo 'This test requires a disposable GitHub Linux runner' >&2; exit 2; }
release=$1
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || exit 2
sudo install -d /usr/local/share/conquist
sudo install -m 644 deploy/actions/compose.yml deploy/actions/verify-release.py deploy/actions/validate-images.py /usr/local/share/conquist/
cleanup() {
  if sudo test -f /opt/conquist/staging/current.yml; then
    sudo docker compose -f /opt/conquist/staging/current.yml down -v
  fi
}
trap cleanup EXIT
{ printf 'deploy %s\n' "$release"; cat images.tar.gz; } | sudo bash deploy/actions/receive.sh staging
python3 deploy/actions/verify-release.py http://127.0.0.1:3103 "$release" staging
bad_release=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
docker tag "conquist-web:$release" "conquist-web:$bad_release"
docker tag "conquist-rooms:$release" "conquist-rooms:$bad_release"
# The retagged frontend reports the original SHA. The receiver must reject it,
# restore the previous containers, and leave room data intact.
if printf 'rollback %s\n' "$bad_release" | sudo bash deploy/actions/receive.sh staging; then
  echo 'ERROR: receiver accepted a mismatched frontend release' >&2
  exit 1
fi
python3 deploy/actions/verify-release.py http://127.0.0.1:3103 "$release" staging
echo 'PASS: deployment, release mismatch detection, and automatic rollback'
