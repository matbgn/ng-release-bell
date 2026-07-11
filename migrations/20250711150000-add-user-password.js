'use strict';

exports.up = function(db) {
    const addColumnIfMissing = (table, column, def) => {
        const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
        if (!cols.includes(column)) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
        }
    };
    addColumnIfMissing('users', 'passwordHash', "TEXT NOT NULL DEFAULT ''");
};
