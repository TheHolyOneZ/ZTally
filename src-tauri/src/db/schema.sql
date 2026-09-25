-- ZTally schema v1
CREATE TABLE IF NOT EXISTS apps (
    id           INTEGER PRIMARY KEY,
    key          TEXT NOT NULL UNIQUE,      -- normalised exe stem (or WM_CLASS for generic hosts)
    display_name TEXT NOT NULL,
    path         TEXT,
    class        TEXT
);

CREATE TABLE IF NOT EXISTS spans (
    id       INTEGER PRIMARY KEY,
    start_ms INTEGER NOT NULL,
    end_ms   INTEGER NOT NULL,
    app_id   INTEGER REFERENCES apps(id) ON DELETE CASCADE,
    title    TEXT NOT NULL DEFAULT '',
    domain   TEXT,
    afk      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS spans_start ON spans(start_ms);
CREATE INDEX IF NOT EXISTS spans_app ON spans(app_id);

CREATE TABLE IF NOT EXISTS categories (
    id    INTEGER PRIMARY KEY,
    name  TEXT NOT NULL,
    slot  INTEGER NOT NULL,                  -- palette slot 1..8
    kind  TEXT NOT NULL CHECK (kind IN ('productive','neutral','distracting'))
);

CREATE TABLE IF NOT EXISTS rules (
    id          INTEGER PRIMARY KEY,
    priority    INTEGER NOT NULL DEFAULT 0,  -- seeded = 0, user = 100
    match_type  TEXT NOT NULL CHECK (match_type IN ('app','domain','title')),
    pattern     TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS goals (
    id          INTEGER PRIMARY KEY,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('total','category','app','domain')),
    target      TEXT NOT NULL DEFAULT '',
    period      TEXT NOT NULL CHECK (period IN ('day','week')),
    op          TEXT NOT NULL CHECK (op IN ('max','min')),
    minutes     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    k TEXT PRIMARY KEY,
    v TEXT NOT NULL
);

-- v2
CREATE TABLE IF NOT EXISTS focus_sessions (
    id         INTEGER PRIMARY KEY,
    start_ms   INTEGER NOT NULL,
    end_ms     INTEGER NOT NULL,
    planned_ms INTEGER NOT NULL,
    drift_ms   INTEGER NOT NULL DEFAULT 0,
    completed  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS focus_start ON focus_sessions(start_ms);

-- v3: media playing while another window is focused (never part of screen-time totals)
CREATE TABLE IF NOT EXISTS audio_spans (
    id       INTEGER PRIMARY KEY,
    start_ms INTEGER NOT NULL,
    end_ms   INTEGER NOT NULL,
    app_id   INTEGER REFERENCES apps(id) ON DELETE CASCADE,
    title    TEXT NOT NULL DEFAULT '',
    domain   TEXT
);
CREATE INDEX IF NOT EXISTS audio_start ON audio_spans(start_ms);

-- v4: microphone in use (calls, meetings, voice chat), recorded regardless of which window is focused
CREATE TABLE IF NOT EXISTS call_spans (
    id       INTEGER PRIMARY KEY,
    start_ms INTEGER NOT NULL,
    end_ms   INTEGER NOT NULL,
    app_id   INTEGER REFERENCES apps(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS call_start ON call_spans(start_ms);
