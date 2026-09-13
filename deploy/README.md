# Deployment

GitHub Actions builds, tests and deploys Conquist. The shared VPS runs only the finished images. Cloudflare supplies DNS and HTTPS proxying.

| Branch | GitHub environment | URL | Compose project | Local port |
| --- | --- | --- | --- | --- |
| `develop` | staging | https://staging.conquist.online | `conquist-staging` | 3103 |
| `main` | production | https://conquist.online | `conquist` | 3101 |

Both branches require pull requests, passing `validate` checks and resolved conversations. Force pushes and branch deletion are blocked, including for admins. Production secrets are available only to `main`; staging secrets only to `develop`. Staging is a public test game with a no-index header and separate room data, not a place for production data or secrets.

## Normal releases

1. Open a feature PR into `develop` and merge after checks pass. **Deploy Conquist** builds and deploys staging automatically.
2. Test the staging game, then open a PR from `develop` into `main`.
3. Merge after checks pass. The same workflow builds and deploys production.

Use **Actions → Deploy Conquist → Run workflow** on `develop` or `main` to deploy that branch. To reuse an existing release exactly, enter its full SHA in `rollback_sha`. A SHA cannot overwrite a previously loaded image with different contents; changed dependencies or build output require a new commit. Deployments are serialized per environment and are not cancelled halfway through a release. PR code runs on GitHub-hosted runners without deployment credentials.

The workflow typechecks, lints and tests the app, exports the client, validates deployment scripts, and builds two images tagged with the full commit SHA. The compressed images and checksum remain in Actions artifacts for 14 days. A dedicated SSH key streams them to the VPS with strict host-key checking. The receiver validates that the archive contains only the two expected Conquist tags before loading it.

The VPS checks container health, the frontend's `/release.json`, and `/api/health`, including their release and environment values. Actions then checks the same values through public HTTPS. Failed container checks restore the previous Compose configuration; a failed public check requests the previous release too. A failed deployment remains failed in GitHub even if recovery succeeds.

## Rollback and data

Run **Deploy Conquist** on the affected branch and supply the previous full commit SHA as `rollback_sha`. The receiver uses the existing immutable images. It rejects missing images before changing containers. Successful releases are recorded in `/opt/conquist/<environment>/history.log`; `current-sha`, `current.yml` and `previous.yml` identify the current and previous release.

Staging and production have separate `conquist-staging_rooms-data` and `conquist_rooms-data` volumes. The receiver backs up the applicable volume under `/opt/conquist/<environment>/backups/` before deployment. Backups and images remain on the server for operator-managed retention; monitor disk use. Room writes use atomic snapshots. A code rollback preserves current room data rather than overwriting moves made since a backup. Review data compatibility before deploying a change to the room format. Never use `docker compose down -v` for a release or rollback.

There is one room-service process per environment. Keep both within the current small private-room scope; horizontal scaling requires a different state store. Brief reconnects during deployments are expected and browser sessions retain their seats.

## Access and infrastructure

The existing server is `arena-staging`, `144.217.90.9`. Read `/opt/README-SHARED-BOX.md` before infrastructure changes. Conquist uses `/opt/conquist/`, loopback ports 3101 and 3103, explicit nginx hostnames, and its own Compose projects. Do not touch `/opt/arena-crawler`, Arena's default vhost, or Questionary. Do not publish Docker ports on `0.0.0.0`.

Each environment's `DEPLOY_SSH_KEY` is an independent key with an SSH forced command, `restrict`, no forwarding and no interactive shell. The root-owned receiver fixes its environment, Compose configuration and filesystem paths. It accepts release images, existing-release rollback, previous-release recovery, and, for staging only, its origin certificate. It cannot run arbitrary commands supplied by the workflow. The existing operator SSH key is not stored in GitHub.

Repository variables are `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS` and `CLOUDFLARE_ZONE_ID`. Staging also has a public `STAGING_ORIGIN_CSR` variable and a `CLOUDFLARE_API_TOKEN` secret limited to DNS Write and SSL and Certificates Write for `conquist.online`. The Cloudflare global key is not stored in GitHub. Normal application releases do not use a Cloudflare credential.

**Configure staging domain** runs when its workflow or provisioner changes on `develop`, and can be run manually on `develop` for renewal. It creates or verifies the proxied staging A record, refuses to replace a conflicting record, and signs the server-generated CSR. The receiver checks the hostname, expiry and public-key match, installs the certificate, tests nginx and reloads it. The private key never leaves `/etc/nginx/ssl/conquist-staging/`. The certificate lasts two years; renew it before expiry. Production keeps its existing origin certificate under `/etc/nginx/ssl/conquist/`, expiring September 8, 2028. Keep Cloudflare Full (strict) TLS enabled.

The one-time server installation puts `actions/receive.sh` at `/usr/local/sbin/conquist-deploy`, the Compose template and Python validators in `/usr/local/share/conquist/`, and `staging-host-nginx.conf` in nginx's sites-available directory. These files must be root-owned and not writable by the deployment key. Changes to the receiver or host routing require an operator to review and install them; app releases go through Actions. Preserve existing authorized keys when installing new forced-command keys.

The standalone Sites build does not host the Node room service. The supported online deployment is the VPS pipeline above. `compose.yml` and `Dockerfile` remain available for local container development, not the normal release process.
