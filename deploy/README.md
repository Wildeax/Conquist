# Shared VPS deployment

Target: `arena-staging`, `144.217.90.9`. Read `/opt/README-SHARED-BOX.md` before making server changes.

Conquist is isolated under `/opt/conquist/releases/`. Each release contains its source and Docker Compose configuration. Never deploy inside `/opt/arena-crawler` or modify its services.

The current alpha is entirely browser-local, so `npm run build:vps` exports static HTML and assets to `app/dist/client`. The container serves these through nginx on port 8080. Compose publishes **only `127.0.0.1:3101`**, with a 128 MB memory limit, log rotation and automatic restart. No database or credentials are included.

`deploy/host-nginx.conf` routes the exact hostname `conquist.online` through the shared nginx. It must never contain `default_server`. Test with `sudo nginx -t` before reloading nginx. Leave Arena and Questionary unchanged.

## Deploy a release

Upload a source archive without `.git`, dependencies, build outputs, environment files or secrets to a new `/opt/conquist/releases/<release>` directory, then extract it there. From that directory:

```sh
CONQUIST_RELEASE=<release> docker compose -f deploy/compose.yml build
CONQUIST_RELEASE=<release> docker compose -f deploy/compose.yml up -d --no-build
curl --fail http://127.0.0.1:3101/healthz
curl --fail -H 'Host: conquist.online' http://127.0.0.1/
```

On the first deployment, install the host vhost in `/etc/nginx/sites-available/conquist`, link it into `sites-enabled`, validate and reload nginx. A separate HTTPS certificate and TLS vhost are required before routing Cloudflare in Full (strict) mode. Do not change the shared default certificate or lower Cloudflare's TLS security mode.

Cloudflare DNS and HTTPS setup require an authenticated account connection. The initial HTTP vhost is preparation, not confirmation that the public HTTPS domain is live.

Initial release installed: `20260909-alpha1`. Container `conquist-web-1` passed its health check; the nginx hostname route, HTML, linked JS/CSS and generated assets returned HTTP 200. Arena health and the Questionary service remained unchanged. DNS and HTTPS are pending Cloudflare reauthorization.

The build-time npm dependency audit reports existing advisories in the framework/toolchain. The final image contains only nginx and exported browser assets, not Node, Vinext, RSC endpoints, npm dependencies or a development server. Review and update the toolchain before adding server-side features; do not expose the development server as a production backend.

## Rollback

Keep prior release directories and image tags. From the previous release directory, run `CONQUIST_RELEASE=<previous-release> docker compose -f deploy/compose.yml up -d --no-build`. The fixed Compose project name `conquist` replaces only Conquist's container. Recheck its health and domain afterward. The first release has no earlier version to roll back to.

Gameplay saves remain in each browser's local storage and are specific to its origin. Saves on localhost do not automatically appear on conquist.online. Hosting this alpha does not add online multiplayer.
