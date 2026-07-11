'use strict';

exports.up = function(db) {
    const addColumnIfMissing = (table, column, def) => {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
        if (!cols.includes(column)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
        }
    };
    addColumnIfMissing('projects', 'emailFrequency', "TEXT NOT NULL DEFAULT 'instant'");
    addColumnIfMissing('projects', 'excludePrereleases', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('projects', 'excludeUpdated', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('projects', 'versionFilters', 'TEXT');
    addColumnIfMissing('projects', 'lastNotifiedAt', 'INTEGER NOT NULL DEFAULT 0');
    addColumnIfMissing('releases', 'sha', "TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing('users', 'quayToken', "TEXT NOT NULL DEFAULT ''");
    addColumnIfMissing('users', 'githubAutoImport', 'INTEGER NOT NULL DEFAULT 0');
};