CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    email TEXT NOT NULL,
    githubToken TEXT NOT NULL DEFAULT '',
    quayToken TEXT NOT NULL DEFAULT '',
    githubAutoImport INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY NOT NULL,
    userId TEXT NOT NULL,
    name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    lastSuccessfulSyncAt INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'github',
    origin TEXT NOT NULL DEFAULT '',
    emailFrequency TEXT NOT NULL DEFAULT 'instant',
    excludePrereleases INTEGER NOT NULL DEFAULT 0,
    excludeUpdated INTEGER NOT NULL DEFAULT 0,
    versionFilters TEXT,
    lastNotifiedAt INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS releases (
    id TEXT PRIMARY KEY NOT NULL,
    projectId TEXT NOT NULL,
    version TEXT NOT NULL,
    body TEXT,
    notified INTEGER NOT NULL DEFAULT 0,
    prerelease INTEGER NOT NULL DEFAULT 0,
    createdAt INTEGER NOT NULL DEFAULT 0,
    sha TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (projectId) REFERENCES projects(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS releases_project_version ON releases(projectId, version);