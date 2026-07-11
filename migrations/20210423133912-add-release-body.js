'use strict';

exports.up = function(db) {
    const cols = db.prepare('PRAGMA table_info(releases)').all().map(c => c.name);
    if (!cols.includes('body')) {
        db.exec('ALTER TABLE releases ADD COLUMN body TEXT');
    }
};