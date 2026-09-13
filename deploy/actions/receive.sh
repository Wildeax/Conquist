#!/usr/bin/env bash
# Root-owned forced SSH command. The key chooses a fixed environment, not a shell.
set -Eeuo pipefail
umask 077
case "${1:-}" in
  staging) project=conquist-staging; port=3103 ;;
  production) project=conquist; port=3101 ;;
  *) echo 'Unknown environment' >&2; exit 2 ;;
esac
environment=$1
root="/opt/conquist/$environment"
mkdir -p "$root/releases"
exec 9>"$root/deploy.lock"
flock -w 600 9
IFS=' ' read -r mode release extra
[[ -z "${extra:-}" ]] || exit 2

if [[ "$mode" == restore ]]; then
  [[ -f "$root/previous.yml" ]] || { echo 'No previous release is available' >&2; exit 1; }
  docker compose -f "$root/previous.yml" up -d --no-build --remove-orphans --wait --wait-timeout 120
  cp "$root/previous.yml" "$root/current.yml"
  docker compose -f "$root/current.yml" config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["web"]["image"].split(":")[-1])' > "$root/current-sha"
  echo "Restored the previous $environment release"
  exit 0
fi

if [[ "$mode" == certificate && "$environment" == staging ]]; then
  cert=/etc/nginx/ssl/conquist-staging/origin.crt
  temporary=$(mktemp "$root/certificate.XXXXXX")
  trap 'rm -f -- "$temporary"' EXIT
  head -c 32768 > "$temporary"
  openssl x509 -in "$temporary" -noout -checkhost staging.conquist.online
  openssl x509 -in "$temporary" -noout -checkend 86400
  cert_key=$(openssl x509 -in "$temporary" -pubkey -noout | openssl sha256)
  origin_key=$(openssl pkey -in /etc/nginx/ssl/conquist-staging/origin.key -pubout | openssl sha256)
  [[ "$cert_key" == "$origin_key" ]] || { echo 'Certificate key mismatch' >&2; exit 1; }
  [[ ! -f "$cert" ]] || cp "$cert" "$cert.previous"
  install -m 644 "$temporary" "$cert"
  ln -sfn /etc/nginx/sites-available/conquist-staging /etc/nginx/sites-enabled/conquist-staging
  if ! nginx -t; then
    if [[ -f "$cert.previous" ]]; then mv "$cert.previous" "$cert"; else rm -f /etc/nginx/sites-enabled/conquist-staging; fi
    exit 1
  fi
  systemctl reload nginx
  echo 'Staging HTTPS configured'
  exit 0
fi

[[ "$mode" == deploy || "$mode" == rollback ]] || exit 2
[[ "$release" =~ ^[a-f0-9]{40}$ ]] || { echo 'Expected a full commit SHA' >&2; exit 2; }
export CONQUIST_PROJECT="$project" CONQUIST_PORT="$port" CONQUIST_ENVIRONMENT="$environment" CONQUIST_RELEASE="$release"
compose=/usr/local/share/conquist/compose.yml
if [[ "$mode" == deploy ]]; then
  archive=$(mktemp "$root/images.XXXXXX")
  trap 'rm -f -- "$archive"' EXIT
  # Limit disk use and validate tags before importing any image into the shared daemon.
  ulimit -f 1048576
  gzip -dc > "$archive"
  python3 /usr/local/share/conquist/validate-images.py "$archive" "$release"
  docker load -i "$archive"
fi
docker image inspect "conquist-web:$release" "conquist-rooms:$release" >/dev/null
if docker volume inspect "${project}_rooms-data" >/dev/null 2>&1; then
  mkdir -p "$root/backups"
  data=$(docker volume inspect "${project}_rooms-data" --format '{{.Mountpoint}}')
  tar -czf "$root/backups/$(date -u +%Y%m%dT%H%M%SZ)-$release.tar.gz" -C "$data" .
fi
release_compose="$root/releases/$release.yml"
docker compose -f "$compose" config > "$release_compose"
previous="$root/previous.yml"
if [[ -f "$root/current.yml" ]]; then cp "$root/current.yml" "$previous"; fi

restore() {
  echo 'Deployment failed; restoring the previous release' >&2
  if [[ -f "$previous" ]]; then
    docker compose -f "$previous" up -d --no-build --remove-orphans --wait --wait-timeout 120
  else
    docker compose -f "$release_compose" down
  fi
}
if ! docker compose -f "$release_compose" up -d --no-build --wait --wait-timeout 120; then
  restore
  exit 1
fi
if ! python3 /usr/local/share/conquist/verify-release.py "http://127.0.0.1:$port" "$release" "$environment"; then
  restore
  exit 1
fi
cp "$release_compose" "$root/current.yml"
printf '%s\n' "$release" > "$root/current-sha"
printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$mode" "$release" >> "$root/history.log"
echo "Deployed $release to $environment"
