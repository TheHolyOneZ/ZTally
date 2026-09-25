

use crate::classify::Rule;
use crate::model::{Settings, WindowInfo};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub type DbResult<T> = Result<T, String>;

fn e(err: rusqlite::Error) -> String {
    err.to_string()
}

pub struct Db {
    conn: Connection,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub slot: i64,
    pub kind: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: i64,
    pub target_kind: String,
    pub target: String,
    pub period: String,
    pub op: String,
    pub minutes: i64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FocusRecord {
    pub start: i64,
    pub end: i64,
    pub planned_ms: i64,
    pub drift_ms: i64,
    pub completed: bool,
}

#[derive(Clone, Debug)]
pub struct SpanRow {
    pub start: i64,
    pub end: i64,
    pub app_key: String,
    pub display: String,
    pub title: String,
    pub domain: Option<String>,
    pub afk: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
    pub key: String,
    pub display: String,
    pub path: Option<String>,
    pub total_ms: i64,
    pub last_seen: i64,
}

const SCHEMA_VERSION: i64 = 4;

impl Db {
    pub fn open(path: &Path) -> DbResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|er| er.to_string())?;
        }
        let conn = Connection::open(path).map_err(e)?;
        Self::init(conn)
    }

    pub fn open_in_memory() -> DbResult<Self> {
        Self::init(Connection::open_in_memory().map_err(e)?)
    }

    fn init(conn: Connection) -> DbResult<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;",
        )
        .map_err(e)?;
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).map_err(e)?;
        if version < SCHEMA_VERSION {
            conn.execute_batch(include_str!("schema.sql")).map_err(e)?;
            conn.execute_batch(&format!("PRAGMA user_version={SCHEMA_VERSION}")).map_err(e)?;
        }
        let db = Self { conn };
        db.seed_if_empty()?;
        Ok(db)
    }


    pub fn wipe(&self) -> DbResult<()> {
        let tx = self.conn.unchecked_transaction().map_err(e)?;
        for table in ["spans", "audio_spans", "call_spans", "focus_sessions", "goals", "rules", "categories", "apps", "settings"] {
            tx.execute(&format!("DELETE FROM {table}"), []).map_err(e)?;
        }
        tx.commit().map_err(e)?;
        self.seed_if_empty()?;

        self.conn.execute_batch("VACUUM").map_err(e)
    }

    fn seed_if_empty(&self) -> DbResult<()> {
        let n: i64 = self.conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0)).map_err(e)?;
        let seeded: i64 = self.kv("seed_version").and_then(|v| v.parse().ok()).unwrap_or(0);
        if n == 0 {
            self.reset_rules_to_defaults(true)?;
        } else if seeded < crate::seed::SEED_VERSION {

            self.reset_rules_to_defaults(false)?;
        } else {
            return Ok(());
        }
        self.set_kv("seed_version", &crate::seed::SEED_VERSION.to_string())
    }


    pub fn reset_rules_to_defaults(&self, with_categories: bool) -> DbResult<()> {
        let tx = self.conn.unchecked_transaction().map_err(e)?;
        if with_categories {
            for (name, slot, kind) in crate::seed::CATEGORIES {
                tx.execute("INSERT INTO categories(name, slot, kind) VALUES (?1, ?2, ?3)", params![name, slot, kind])
                    .map_err(e)?;
            }
        }
        tx.execute("DELETE FROM rules WHERE priority = 0", []).map_err(e)?;
        let cat_id = |name: &str| -> Option<i64> {
            tx.query_row("SELECT id FROM categories WHERE name = ?1", [name], |r| r.get(0)).optional().ok().flatten()
        };
        for (kind, table) in [("app", crate::seed::APP_RULES), ("domain", crate::seed::DOMAIN_RULES)] {
            for (cat, patterns) in table {
                let Some(id) = cat_id(cat) else { continue };
                for p in *patterns {
                    tx.execute(
                        "INSERT INTO rules(priority, match_type, pattern, category_id) VALUES (0, ?1, ?2, ?3)",
                        params![kind, p, id],
                    )
                    .map_err(e)?;
                }
            }
        }
        tx.commit().map_err(e)
    }


    pub fn upsert_app(&self, w: &WindowInfo) -> DbResult<i64> {
        self.conn
            .query_row(
                "INSERT INTO apps(key, display_name, path, class) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(key) DO UPDATE SET path = COALESCE(excluded.path, apps.path),
                                                class = COALESCE(excluded.class, apps.class)
                 RETURNING id",
                params![w.app_key, w.display, w.exe, w.class],
                |r| r.get(0),
            )
            .map_err(e)
    }

    pub fn insert_span(&self, start: i64, end: i64, app_id: Option<i64>, title: &str, domain: Option<&str>, afk: bool) -> DbResult<i64> {
        self.conn
            .execute(
                "INSERT INTO spans(start_ms, end_ms, app_id, title, domain, afk) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![start, end, app_id, title, domain, afk],
            )
            .map_err(e)?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn update_span_end(&self, id: i64, end: i64) -> DbResult<()> {
        self.conn.execute("UPDATE spans SET end_ms = ?2 WHERE id = ?1", params![id, end]).map_err(e)?;
        Ok(())
    }

    pub fn delete_spans_by_id(&self, id: i64) -> DbResult<()> {
        self.conn.execute("DELETE FROM spans WHERE id = ?1", [id]).map_err(e)?;
        Ok(())
    }


    pub fn spans_in(&self, start: i64, end: i64) -> DbResult<Vec<SpanRow>> {
        let mut stmt = self
            .conn
            .prepare_cached(
                "SELECT s.start_ms, s.end_ms, COALESCE(a.key, ''), COALESCE(a.display_name, ''), s.title, s.domain, s.afk
                 FROM spans s LEFT JOIN apps a ON a.id = s.app_id
                 WHERE s.start_ms < ?2 AND s.end_ms > ?1
                 ORDER BY s.start_ms",
            )
            .map_err(e)?;
        let rows = stmt
            .query_map(params![start, end], |r| {
                Ok(SpanRow {
                    start: r.get::<_, i64>(0)?.max(start),
                    end: r.get::<_, i64>(1)?.min(end),
                    app_key: r.get(2)?,
                    display: r.get(3)?,
                    title: r.get(4)?,
                    domain: r.get(5)?,
                    afk: r.get(6)?,
                })
            })
            .map_err(e)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(e)
    }

    pub fn delete_spans(&self, start: i64, end: i64, app_key: Option<&str>) -> DbResult<usize> {
        match app_key {
            Some(k) => self
                .conn
                .execute(
                    "DELETE FROM audio_spans WHERE start_ms < ?2 AND end_ms > ?1 AND app_id = (SELECT id FROM apps WHERE key = ?3)",
                    params![start, end, k],
                )
                .and_then(|_| {
                    self.conn.execute(
                        "DELETE FROM call_spans WHERE start_ms < ?2 AND end_ms > ?1 AND app_id = (SELECT id FROM apps WHERE key = ?3)",
                        params![start, end, k],
                    )
                })
                .and_then(|_| self.conn.execute(
                "DELETE FROM spans WHERE start_ms < ?2 AND end_ms > ?1 AND app_id = (SELECT id FROM apps WHERE key = ?3)",
                params![start, end, k],
            )),
            None => {
                self.conn
                    .execute("DELETE FROM audio_spans WHERE start_ms < ?2 AND end_ms > ?1", params![start, end])
                    .map_err(e)?;
                self.conn
                    .execute("DELETE FROM focus_sessions WHERE start_ms < ?2 AND end_ms > ?1", params![start, end])
                    .map_err(e)?;
                self.conn
                    .execute("DELETE FROM call_spans WHERE start_ms < ?2 AND end_ms > ?1", params![start, end])
                    .map_err(e)?;
                self.conn.execute("DELETE FROM spans WHERE start_ms < ?2 AND end_ms > ?1", params![start, end])
            }
        }
        .map_err(e)
    }

    pub fn apps(&self) -> DbResult<Vec<AppEntry>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT a.key, a.display_name, a.path,
                        COALESCE(SUM(CASE WHEN s.afk = 0 THEN s.end_ms - s.start_ms END), 0),
                        COALESCE(MAX(s.end_ms), 0)
                 FROM apps a LEFT JOIN spans s ON s.app_id = a.id
                 GROUP BY a.id ORDER BY 4 DESC",
            )
            .map_err(e)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(AppEntry { key: r.get(0)?, display: r.get(1)?, path: r.get(2)?, total_ms: r.get(3)?, last_seen: r.get(4)? })
            })
            .map_err(e)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(e)
    }

    pub fn rename_app(&self, key: &str, display: &str) -> DbResult<()> {
        self.conn.execute("UPDATE apps SET display_name = ?2 WHERE key = ?1", params![key, display]).map_err(e)?;
        Ok(())
    }

    pub fn domains(&self) -> DbResult<Vec<(String, i64)>> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT domain, SUM(end_ms - start_ms) FROM spans WHERE domain IS NOT NULL AND afk = 0
                 GROUP BY domain ORDER BY 2 DESC LIMIT 500",
            )
            .map_err(e)?;
        let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?))).map_err(e)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(e)
    }

    pub fn first_span_start(&self) -> DbResult<Option<i64>> {
        self.conn.query_row("SELECT MIN(start_ms) FROM spans", [], |r| r.get(0)).map_err(e)
    }


    pub fn insert_audio(&self, start: i64, end: i64, app_id: i64, title: &str, domain: Option<&str>) -> DbResult<i64> {
        self.conn
            .execute(
                "INSERT INTO audio_spans(start_ms, end_ms, app_id, title, domain) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![start, end, app_id, title, domain],
            )
            .map_err(e)?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn update_audio_end(&self, id: i64, end: i64) -> DbResult<()> {
        self.conn.execute("UPDATE audio_spans SET end_ms = ?2 WHERE id = ?1", params![id, end]).map_err(e)?;
        Ok(())
    }


    pub fn audio_in(&self, start: i64, end: i64) -> DbResult<Vec<SpanRow>> {
        let mut stmt = self
            .conn
            .prepare_cached(
                "SELECT s.start_ms, s.end_ms, COALESCE(a.key, ''), COALESCE(a.display_name, ''), s.title, s.domain
                 FROM audio_spans s LEFT JOIN apps a ON a.id = s.app_id
                 WHERE s.start_ms < ?2 AND s.end_ms > ?1
                 ORDER BY s.start_ms",
            )
            .map_err(e)?;
        let rows = stmt
            .query_map(params![start, end], |r| {
                Ok(SpanRow {
                    start: r.get::<_, i64>(0)?.max(start),
                    end: r.get::<_, i64>(1)?.min(end),
                    app_key: r.get(2)?,
                    display: r.get(3)?,
                    title: r.get(4)?,
                    domain: r.get(5)?,
                    afk: false,
                })
            })
            .map_err(e)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(e)
    }


    pub fn insert_call(&self, start: i64, end: i64, app_id: i64) -> DbResult<i64> {
        self.conn
            .execute("INSERT INTO call_spans(start_ms, end_ms, app_id) VALUES (?1, ?2, ?3)", params![start, end, app_id])
            .map_err(e)?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn update_call_end(&self, id: i64, end: i64) -> DbResult<()> {
        self.conn.execute("UPDATE call_spans SET end_ms = ?2 WHERE id = ?1", params![id, end]).map_err(e)?;
        Ok(())
    }


    pub fn calls_in(&self, start: i64, end: i64) -> DbResult<Vec<SpanRow>> {
        let mut stmt = self
            .conn
            .prepare_cached(
                "SELECT s.start_ms, s.end_ms, COALESCE(a.key, ''), COALESCE(a.display_name, '')
                 FROM call_spans s LEFT JOIN apps a ON a.id = s.app_id
                 WHERE s.start_ms < ?2 AND s.end_ms > ?1
                 ORDER BY s.start_ms",
            )
            .map_err(e)?;
        let rows = stmt
            .query_map(params![start, end], |r| {
                Ok(SpanRow {
                    start: r.get::<_, i64>(0)?.max(start),
                    end: r.get::<_, i64>(1)?.min(end),
                    app_key: r.get(2)?,
                    display: r.get(3)?,
                    title: String::new(),
                    domain: None,
                    afk: false,
                })
            })
            .map_err(e)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(e)
    }


    pub fn insert_focus(&self, f: &FocusRecord) -> DbResult<()> {
        self.conn
            .execute(
                "INSERT INTO focus_sessions(start_ms, end_ms, planned_ms, drift_ms, completed) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![f.start, f.end, f.planned_ms, f.drift_ms, f.completed],
            )
            .map_err(e)?;
        Ok(())
    }

    pub fn focus_in(&self, start: i64, end: i64) -> DbResult<Vec<FocusRecord>> {
        let mut stmt = self
            .conn
            .prepare_cached(
                "SELECT start_ms, end_ms, planned_ms, drift_ms, completed FROM focus_sessions
                 WHERE start_ms < ?2 AND end_ms > ?1 ORDER BY start_ms",
            )
            .map_err(e)?;
        let rows = stmt
            .query_map(params![start, end], |r| {
                Ok(FocusRecord { start: r.get(0)?, end: r.get(1)?, planned_ms: r.get(2)?, drift_ms: r.get(3)?, completed: r.get(4)? })
            })
            .map_err(e)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(e)
    }


    pub fn categories(&self) -> DbResult<Vec<Category>> {
        let mut stmt = self.conn.prepare("SELECT id, name, slot, kind FROM categories ORDER BY id").map_err(e)?;
        let rows = stmt
            .query_map([], |r| Ok(Category { id: r.get(0)?, name: r.get(1)?, slot: r.get(2)?, kind: r.get(3)? }))
            .map_err(e)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(e)
    }

    pub fn upsert_category(&self, c: &Category) -> DbResult<i64> {
        if c.id > 0 {
            self.conn
                .execute(
                    "UPDATE categories SET name = ?2, slot = ?3, kind = ?4 WHERE id = ?1",
                    params![c.id, c.name, c.slot, c.kind],
                )
                .map_err(e)?;
            Ok(c.id)
        } else {
            self.conn
                .execute("INSERT INTO categories(name, slot, kind) VALUES (?1, ?2, ?3)", params![c.name, c.slot, c.kind])
                .map_err(e)?;
            Ok(self.conn.last_insert_rowid())
        }
    }

    pub fn delete_category(&self, id: i64) -> DbResult<()> {
        self.conn.execute("DELETE FROM categories WHERE id = ?1", [id]).map_err(e)?;
        Ok(())
    }


    pub fn rules(&self) -> DbResult<Vec<Rule>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, priority, match_type, pattern, category_id FROM rules ORDER BY priority DESC, id DESC")
            .map_err(e)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Rule { id: r.get(0)?, priority: r.get(1)?, match_type: r.get(2)?, pattern: r.get(3)?, category_id: r.get(4)? })
            })
            .map_err(e)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(e)
    }


    pub fn add_rule(&self, match_type: &str, pattern: &str, category_id: i64) -> DbResult<i64> {
        let pattern = pattern.trim();
        let pattern = if match_type == "title" { pattern.to_string() } else { pattern.to_lowercase() };
        self.conn
            .execute("DELETE FROM rules WHERE priority > 0 AND match_type = ?1 AND pattern = ?2", params![match_type, pattern])
            .map_err(e)?;
        self.conn
            .execute(
                "INSERT INTO rules(priority, match_type, pattern, category_id) VALUES (100, ?1, ?2, ?3)",
                params![match_type, pattern, category_id],
            )
            .map_err(e)?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn delete_rule(&self, id: i64) -> DbResult<()> {
        self.conn.execute("DELETE FROM rules WHERE id = ?1", [id]).map_err(e)?;
        Ok(())
    }


    pub fn goals(&self) -> DbResult<Vec<Goal>> {
        let mut stmt = self.conn.prepare("SELECT id, target_kind, target, period, op, minutes FROM goals ORDER BY id").map_err(e)?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Goal {
                    id: r.get(0)?,
                    target_kind: r.get(1)?,
                    target: r.get(2)?,
                    period: r.get(3)?,
                    op: r.get(4)?,
                    minutes: r.get(5)?,
                })
            })
            .map_err(e)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(e)
    }

    pub fn upsert_goal(&self, g: &Goal) -> DbResult<i64> {
        if g.id > 0 {
            self.conn
                .execute(
                    "UPDATE goals SET target_kind=?2, target=?3, period=?4, op=?5, minutes=?6 WHERE id=?1",
                    params![g.id, g.target_kind, g.target, g.period, g.op, g.minutes],
                )
                .map_err(e)?;
            Ok(g.id)
        } else {
            self.conn
                .execute(
                    "INSERT INTO goals(target_kind, target, period, op, minutes) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![g.target_kind, g.target, g.period, g.op, g.minutes],
                )
                .map_err(e)?;
            Ok(self.conn.last_insert_rowid())
        }
    }

    pub fn delete_goal(&self, id: i64) -> DbResult<()> {
        self.conn.execute("DELETE FROM goals WHERE id = ?1", [id]).map_err(e)?;
        Ok(())
    }


    pub fn settings(&self) -> Settings {
        self.conn
            .query_row("SELECT v FROM settings WHERE k = 'settings'", [], |r| r.get::<_, String>(0))
            .optional()
            .ok()
            .flatten()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save_settings(&self, s: &Settings) -> DbResult<()> {
        let json = serde_json::to_string(s).map_err(|er| er.to_string())?;
        self.conn
            .execute("INSERT INTO settings(k, v) VALUES ('settings', ?1) ON CONFLICT(k) DO UPDATE SET v = excluded.v", [json])
            .map_err(e)?;
        Ok(())
    }

    pub fn kv(&self, k: &str) -> Option<String> {
        self.conn.query_row("SELECT v FROM settings WHERE k = ?1", [k], |r| r.get(0)).optional().ok().flatten()
    }

    pub fn set_kv(&self, k: &str, v: &str) -> DbResult<()> {
        self.conn
            .execute("INSERT INTO settings(k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = excluded.v", [k, v])
            .map_err(e)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeds_and_roundtrips() {
        let db = Db::open_in_memory().unwrap();
        assert_eq!(db.categories().unwrap().len(), crate::seed::CATEGORIES.len());
        assert!(db.rules().unwrap().len() > 150);

        let w = WindowInfo { app_key: "code".into(), display: "VS Code".into(), exe: None, class: Some("Code".into()), title: "t".into() };
        let a = db.upsert_app(&w).unwrap();
        assert_eq!(a, db.upsert_app(&w).unwrap());
        let s = db.insert_span(1000, 2000, Some(a), "t", None, false).unwrap();
        db.update_span_end(s, 5000).unwrap();
        let rows = db.spans_in(1500, 4000).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!((rows[0].start, rows[0].end), (1500, 4000));
        assert_eq!(rows[0].app_key, "code");

        db.add_rule("app", "Code", 3).unwrap();
        db.add_rule("app", "code", 4).unwrap();
        let user: Vec<_> = db.rules().unwrap().into_iter().filter(|r| r.priority > 0).collect();
        assert_eq!(user.len(), 1);
        assert_eq!((user[0].pattern.as_str(), user[0].category_id), ("code", 4));

        let f = FocusRecord { start: 10, end: 20, planned_ms: 10, drift_ms: 1, completed: true };
        db.insert_focus(&f).unwrap();
        assert_eq!(db.focus_in(0, 15).unwrap(), vec![f]);
        db.delete_spans(0, 100, None).unwrap();
        assert!(db.focus_in(0, 100).unwrap().is_empty(), "forgetting a range also forgets its focus sessions");

        let mut st = db.settings();
        st.idle_threshold_s = 42;
        db.save_settings(&st).unwrap();
        assert_eq!(db.settings().idle_threshold_s, 42);
    }
}
