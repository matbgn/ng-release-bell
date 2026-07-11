'use strict';

const fs = require('fs');
const path = require('path');

function runMigrations(db) {
    db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY NOT NULL, appliedAt TEXT NOT NULL)');

    const migrationsDir = path.join(__dirname, '../migrations');
    if (!fs.existsSync(migrationsDir)) return;

    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.js') && !f.startsWith('_'))
        .sort();

    for (const file of files) {
        const already = db.prepare('SELECT name FROM _migrations WHERE name=?').get(file);
        if (already) continue;

        console.log('Running migration:', file);
        const migration = require(path.join(migrationsDir, file));
        migration.up(db);
        db.prepare('INSERT INTO _migrations (name, appliedAt) VALUES (?, ?)').run(file, new Date().toISOString());
    }
}

module.exports = { runMigrations };