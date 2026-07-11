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

## Installation

### Docker Compose

```bash
docker compose up -d --build
```

The app will be available at `http://localhost:3111`.

### Local Development

```bash
# Start MySQL
docker compose up -d mysql

# Run migrations
npx db-migrate up

# Start backend
PORT=3000 node index.js

# Start frontend (separate terminal)
npx vite
```

The frontend will be at `http://localhost:5173` and proxies API calls to the backend.

#### Sending Notifications via Email

Export the following env variables for email notifications:

```bash
export CLOUDRON_MAIL_SMTP_SERVER=smtp.example.com
export CLOUDRON_MAIL_SMTP_PORT=25
export CLOUDRON_MAIL_SMTP_USERNAME=
export CLOUDRON_MAIL_SMTP_PASSWORD=
export CLOUDRON_MAIL_FROM=ng-release-bell@example.com
export CLOUDRON_APP_ORIGIN=example.com
```

## Configuration

### Provider Tokens

| Provider | Token | Scope | Where to get |
|----------|-------|-------|--------------|
| GitHub / GHCR | GitHub Token | `read:packages` | [GitHub Settings](https://github.com/settings/tokens/new?description=NG-Release-Bell&scopes=read:packages) |
| Quay | Quay Token | - | Quay.io > User Settings > CLI Configuration |

Tokens are configured in the Settings dialog.

## License

MIT