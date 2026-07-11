'use strict';

exports.up = function(db) {
    const cols = db.prepare('PRAGMA table_info(releases)').all().map(c => c.name);
    if (!cols.includes('prerelease')) {
        db.exec('ALTER TABLE releases ADD COLUMN prerelease INTEGER NOT NULL DEFAULT 0');
    }
};