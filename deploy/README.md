# Shared VPS deployment

Target: `arena-staging`, `144.217.90.9`. Read `/opt/README-SHARED-BOX.md` before making server changes.

Conquist is isolated under `/opt/conquist/releases/`. Each release contains its source and Docker Compose configuration. Never deploy inside `/opt/arena-crawler` or modify its services.

`npm run build:vps` exports static HTML and assets to `app/dist/client`. The web container serves these through nginx on port 8080 and forwards `/api/` to the private Node room service. Compose publishes **only `127.0.0.1:3101`**. The web container has a 128 MB memory limit; rooms have 256 MB. Both have log rotation and automatic restart. The room image uses only Node built-ins and shared rules, without the frontend npm dependencies.

The `conquist_rooms-data` named volume stores room snapshots and hashed seat credentials across container restarts and releases. Back up this volume with access restricted to operators. Do not run `docker compose down -v` during an update or rollback. Run only one room-service replica against this volume. Rooms expire after seven days without a mutation. TLS on the existing host proxy protects room credentials in transit.

`deploy/host-nginx.conf` routes the exact hostname `conquist.online` through the shared nginx. It must never contain `default_server`. Test with `sudo nginx -t` before reloading nginx. Leave Arena and Questionary unchanged.

## Deploy a release

Upload a source archive without `.git`, dependencies, build outputs, environment files or secrets to a new `/opt/conquist/releases/<release>` directory, then extract it there. From that directory:

```sh
CONQUIST_RELEASE=<release> docker compose -f deploy/compose.yml build
CONQUIST_RELEASE=<release> docker compose -f deploy/compose.yml up -d --no-build
curl --fail http://127.0.0.1:3101/healthz
curl --fail http://127.0.0.1:3101/api/health
curl --fail https://conquist.online/
```

On the first deployment, install the host vhost in `/etc/nginx/sites-available/conquist`, link it into `sites-enabled`, validate and reload nginx. Install Conquist's origin certificate first. Do not change the shared default certificate or lower Cloudflare's TLS security mode.

Public URL: **https://conquist.online/**. The apex has a Cloudflare-proxied A record pointing to `144.217.90.9`. Conquist's zone uses Full (strict) TLS, with HTTP redirected to HTTPS by nginx. No other zone was changed.

Initial release installed: `20260909-alpha1`. Container `conquist-web-1` passed its health check; the public HTTPS page and generated assets returned HTTP 200 through Cloudflare. Arena health and the Questionary service remained unchanged.

Origin TLS files are `/etc/nginx/ssl/conquist/origin.crt` and `origin.key`. The private key was generated on the VPS, is root-only, and is not in this repository. Certificate expiry: **2028-09-08 21:25 UTC**; renew before that date. Origin CA certificates require Cloudflare proxying and are not directly trusted by browsers. The previous HTTP vhost is backed up at `/etc/nginx/sites-available/conquist.http-backup`.

Cloudflare Global API Keys use `X-Auth-Key` with `X-Auth-Email`, not Bearer token authentication. Never store credentials in release archives or this repository. Rotate the key shared in chat; the running site does not depend on it.

The build-time npm dependency audit reports existing advisories in the framework/toolchain. The web image contains only nginx and exported browser assets. The separate room image runs the minimal HTTP service, not Vinext, RSC endpoints or a development server. Keep the Node and nginx base images patched.

## Rollback

Keep prior release directories and both image tags, `conquist:<release>` and `conquist-rooms:<release>`. From the previous release directory, run `CONQUIST_RELEASE=<previous-release> docker compose -f deploy/compose.yml up -d --no-build`. The fixed Compose project name `conquist` replaces only Conquist's services. Recheck web and API health afterward. A rollback to a pre-multiplayer release disables online play; retain the room data volume for recovery.

Local gameplay saves remain in each browser's local storage and are specific to its origin. Online room credentials remain in the originating tab's session storage; the server stores the match. Existing browser-local saves do not become online matches.
