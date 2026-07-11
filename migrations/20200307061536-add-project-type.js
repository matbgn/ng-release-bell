'use strict';

exports.up = function(db) {
    const cols = db.prepare('PRAGMA table_info(projects)').all().map(c => c.name);
    if (!cols.includes('type')) {
        db.exec("ALTER TABLE projects ADD COLUMN type TEXT NOT NULL DEFAULT 'github'");
    }
};