DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER NOT NULL,

    email TEXT UNIQUE NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,

    mps INTEGER NOT NULL DEFAULT 0,
    reserved_mps INTEGER NOT NULL DEFAULT 0,
    roles INTEGER NOT NULL DEFAULT 0,
    referrer INTEGER
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users ON users(email);

-- Seed initial users
INSERT INTO users (id, first_name, last_name, created_at, mps, roles, email, referrer)
VALUES
    (0, 'Bank',         'Mannr',    1752835943086,  -1,      0,       'no-reply@mannr.org',          0),
    (1, 'Mauritz',      'Dressler', 1752855817430,  11000, 127,     'm@dressler.co',               0),
    (2, 'Samuel',       'Sebald',   1752855924095,  1000,   31,      'samuel@sebald.co',            1),
    (3, 'Selina',       'Fischer',  1752855971694,  10,     31,      'selina.c.fischer@outlook.de', 1),
    (4, 'Alina',        'Sebald',   1762355546085,  10,      7,       'alinasebald@icloud.com',      1),
    (5, 'Charlotte',    'Dressler', 1762355546085,  10,      7,       'charlotte@dressler.co',       1),
    (6, 'Linda',        'Betz',     1762355546085,  10,      7,       'lin.betz@icloud.com',         1);
