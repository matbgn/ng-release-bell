# NG Release Bell

A self-hosted release notification service. Track releases across multiple providers: GitHub, GitLab, Gitea/Codeberg, NPM, PyPI, Docker Hub, Quay, GitHub Container Registry, and SourceForge.

## Features

- **Multi-provider support**: GitHub, GitLab, Gitea/Codeberg, NPM, PyPI, Docker Hub, Quay, GHCR, SourceForge
- **Per-project notification settings**: Instant, hourly, daily, or weekly email digests
- **Version filtering**: Regex-based include/exclude patterns with live preview
- **Pre-release exclusion**: Suppress notifications for pre-releases
- **Re-release suppression**: Detect and optionally suppress re-released versions
- **Safe regex**: User-supplied regex validated against ReDoS attacks via `safe-regex`
- **Import/Export**: Backup and restore your tracked projects as JSON
- **Search**: Filter projects by name, type, or version
- **SQLite**: Embedded database — no external DB server required

## Requirements

- Node.js 26+ (for built-in `node:sqlite`)
- [just](https://github.com/casey/just) (task runner)

## Development

```bash
# Install dependencies
npm install

# Start backend + Vite dev server
just dev
```

The app runs at `http://localhost:5173`. The backend is at `http://localhost:3000`.

SQLite database auto-creates at `./data/ng-release-bell.db`.

## Docker

```bash
# Build and run
just docker-build-run

# View logs
just docker-logs

# Stop
just docker-clean
```

The app runs at `http://localhost:3111`.

## Configuration

Copy `.env` and adjust as needed:

```bash
cp .env .env
```

| Variable | Purpose | Required |
|----------|---------|----------|
| `DB_PATH` | SQLite file path | No (default: `./data/ng-release-bell.db`) |
| `DATA_DIR` | Directory for the session secret + database | No (default: `./data`) |
| `MAIL_SMTP_SERVER` | SMTP server for email notifications | No (disables emails if empty) |
| `MAIL_SMTP_PORT` | SMTP port | No |
| `MAIL_SMTP_USERNAME` | SMTP username | No |
| `MAIL_SMTP_PASSWORD` | SMTP password | No |
| `MAIL_FROM` | From address for emails | No |
| `APP_ORIGIN` | Public URL of the app | No |
| `GITHUB_TOKEN` | GitHub API token (for starred repo import + GHCR) | No |
| `QUAY_TOKEN` | Quay API token | No |
| `OIDC_ISSUER` | OIDC issuer URL | No (password login fallback if empty) |
| `OIDC_CLIENT_ID` | OIDC client ID | No (required with `OIDC_ISSUER`) |
| `OIDC_CLIENT_SECRET` | OIDC client secret | No (required with `OIDC_ISSUER`) |
| `ADMIN_PASSWORD` | Pre-provisions the admin user on first run (password mode) | No |
| `ADMIN_EMAIL` | Email for the admin user (default: `admin@ngreleasebell.local`) | No |

### Authentication

- **OIDC (optional)**: set `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` together to enable OIDC login with any standards-compliant issuer (custom or hosted). When these are set, the "Login" button starts the OIDC flow.
- **Password fallback (default)**: when the OIDC variables are empty, NG Release Bell uses a built-in password login — there is no auto-authenticated mock user.
  - **First-run setup**: on a fresh database with no users, the UI shows a setup wizard to create an admin password.
  - **Headless / Docker**: set `ADMIN_PASSWORD` (and optionally `ADMIN_EMAIL`) to provision the admin user automatically on first run.
  - **Change password**: use the Settings dialog to update the admin password.

> **Known limitation**: the session is a stateless signed cookie and cannot be individually revoked server-side; logout clears the client-side cookie. This is acceptable for a single-user self-hosted deployment.

### Provider Tokens

| Provider | Token | Scope | Where to get |
|----------|-------|-------|--------------|
| GitHub / GHCR | GitHub Token | `read:packages` | [GitHub Settings](https://github.com/settings/tokens/new?description=NG-Release-Bell&scopes=read:packages) |
| Quay | Quay Token | - | Quay.io > User Settings > CLI Configuration |

Tokens are configured in the Settings dialog or via environment variables.

## Migrating from MySQL

If you have an existing MySQL installation, use the Import/Export feature in Settings to export your projects, then import them into the new SQLite installation.

## License

MIT