'use strict';

exports.up = function(db) {
    const cols = db.prepare('PRAGMA table_info(projects)').all().map(c => c.name);
    if (!cols.includes('origin')) {
        db.exec("ALTER TABLE projects ADD COLUMN origin TEXT NOT NULL DEFAULT ''");
    }
};