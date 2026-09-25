

use crate::classify::Classifier;
use crate::db::{Category, Goal, SpanRow};
use serde::Serialize;
use std::collections::HashMap;

const MIN: i64 = 60_000;
const HOUR: i64 = 3_600_000;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cell {
    pub app: String,
    pub display: String,
    pub title: String,
    pub domain: Option<String>,
    pub cat: Option<i64>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LedgerItem {
    pub key: String,
    pub label: String,
    pub cat: Option<i64>,
    pub ms: i64,

    pub mixed: bool,

    pub titles: Vec<(String, i64)>,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CatTotal {
    pub id: Option<i64>,
    pub ms: i64,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Streak {
    pub start: i64,
    pub end: i64,
    pub ms: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub active_ms: i64,
    pub afk_ms: i64,
    pub productive_ms: i64,
    pub distracting_ms: i64,
    pub first_ms: Option<i64>,
    pub last_ms: Option<i64>,
    pub switches: u32,
    pub focus: Option<Streak>,
    pub categories: Vec<CatTotal>,
    pub apps: Vec<LedgerItem>,
    pub domains: Vec<LedgerItem>,

    pub background_ms: i64,

    pub background_focus_ms: i64,
    pub background: Vec<BackgroundItem>,

    pub call_ms: i64,
    pub calls: Vec<BackgroundItem>,
}


#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundItem {
    #[serde(flatten)]
    pub item: LedgerItem,

    pub via: Option<String>,

    pub during: Vec<(Option<i64>, i64)>,

    pub away_ms: i64,
}


#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BgSeg {
    pub from: i64,
    pub to: i64,
    pub app: String,
    pub display: String,
    pub title: String,
    pub cat: Option<i64>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DayView {
    pub start: i64,
    pub end: i64,

    pub minutes: Vec<i32>,
    pub cells: Vec<Cell>,
    pub background: Vec<BgSeg>,
    pub calls: Vec<BgSeg>,
    pub summary: Summary,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct HourCell {
    pub active_ms: i64,
    pub cat: Option<i64>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DayTotal {
    pub start: i64,
    pub end: i64,
    pub active_ms: i64,
    pub afk_ms: i64,
    pub categories: Vec<CatTotal>,
    pub hours: Vec<HourCell>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RangeView {
    pub start: i64,
    pub end: i64,
    pub days: Vec<DayTotal>,
    pub summary: Summary,
}

pub struct Ctx<'a> {
    pub classifier: &'a Classifier,
    pub kinds: HashMap<i64, String>,
}

impl<'a> Ctx<'a> {
    pub fn new(classifier: &'a Classifier, cats: &[Category]) -> Self {
        Self { classifier, kinds: cats.iter().map(|c| (c.id, c.kind.clone())).collect() }
    }
    fn cat(&self, r: &SpanRow) -> Option<i64> {
        self.classifier.classify(&r.app_key, r.domain.as_deref(), &r.title)
    }
    fn kind(&self, cat: Option<i64>) -> &str {
        cat.and_then(|c| self.kinds.get(&c)).map(String::as_str).unwrap_or("neutral")
    }
}

fn dur(r: &SpanRow) -> i64 {
    (r.end - r.start).max(0)
}

fn sorted_totals<K: Clone + Eq + std::hash::Hash>(m: HashMap<K, i64>) -> Vec<(K, i64)> {
    let mut v: Vec<_> = m.into_iter().collect();
    v.sort_by(|a, b| b.1.cmp(&a.1));
    v
}


pub fn focus_streak(ctx: &Ctx, rows: &[SpanRow]) -> Option<Streak> {
    const BLIP: i64 = 60_000;
    const GAP: i64 = 2 * MIN;
    let mut best: Option<Streak> = None;
    let mut cur: Option<Streak> = None;
    let mut last_end: Option<i64> = None;
    let close = |cur: &mut Option<Streak>, best: &mut Option<Streak>| {
        if let Some(c) = cur.take() {
            if best.as_ref().is_none_or(|b| c.ms > b.ms) {
                *best = Some(c);
            }
        }
    };
    for r in rows.iter().filter(|r| !r.afk && dur(r) > 0) {
        if last_end.is_some_and(|l| r.start - l > GAP) {
            close(&mut cur, &mut best);
        }
        last_end = Some(last_end.map_or(r.end, |l| l.max(r.end)));
        let productive = ctx.kind(ctx.cat(r)) == "productive";
        match (&mut cur, productive) {
            (Some(c), true) => {
                c.end = r.end;
                c.ms += dur(r);
            }
            (None, true) => cur = Some(Streak { start: r.start, end: r.end, ms: dur(r) }),
            (Some(_), false) if dur(r) < BLIP => {}
            (Some(_), false) => close(&mut cur, &mut best),
            (None, false) => {}
        }
    }
    close(&mut cur, &mut best);
    best.filter(|b| b.ms >= 5 * MIN)
}


fn overlapping(rows: &[SpanRow], start: i64, end: i64) -> impl Iterator<Item = (&SpanRow, i64)> {
    let first = rows.partition_point(|r| r.end <= start);
    rows[first..].iter().take_while(move |r| r.start < end).map(move |r| (r, r.end.min(end) - r.start.max(start))).filter(|(_, ms)| *ms > 0)
}

fn background_items(ctx: &Ctx, rows: &[SpanRow], audio: &[SpanRow]) -> (i64, i64, Vec<BackgroundItem>) {
    struct Acc<'a> {
        label: &'a str,
        via: Option<&'a str>,
        cat: Option<i64>,
        ms: i64,
        titles: HashMap<&'a str, i64>,
        during: HashMap<Option<i64>, i64>,
        away: i64,
    }
    let mut total = 0;
    let mut focus = 0;
    let mut by: HashMap<&str, Acc> = HashMap::new();
    for r in audio {
        let d = dur(r);
        if d == 0 {
            continue;
        }
        total += d;

        let key = r.domain.as_deref().unwrap_or(&r.app_key);
        let e = by.entry(key).or_insert_with(|| Acc {
            label: r.domain.as_deref().unwrap_or(&r.display),
            via: r.domain.as_ref().map(|_| r.display.as_str()),
            cat: ctx.cat(r),
            ms: 0,
            titles: HashMap::new(),
            during: HashMap::new(),
            away: 0,
        });
        e.ms += d;
        *e.titles.entry(&r.title).or_default() += d;
        let mut covered = 0;
        for (fg, ms) in overlapping(rows, r.start, r.end) {
            covered += ms;
            if fg.afk {
                e.away += ms;
            } else {
                let c = ctx.cat(fg);
                *e.during.entry(c).or_default() += ms;
                if ctx.kind(c) == "productive" {
                    focus += ms;
                }
            }
        }
        e.away += d - covered;
    }
    let mut items: Vec<BackgroundItem> = by
        .into_iter()
        .map(|(k, a)| BackgroundItem {
            item: LedgerItem {
                key: k.to_string(),
                label: a.label.to_string(),
                cat: a.cat,
                mixed: false,
                ms: a.ms,
                titles: sorted_totals(a.titles).into_iter().filter(|(t, _)| !t.is_empty()).take(5).map(|(t, ms)| (t.to_string(), ms)).collect(),
            },
            via: a.via.map(str::to_string),
            during: sorted_totals(a.during),
            away_ms: a.away,
        })
        .collect();
    items.sort_by(|a, b| b.item.ms.cmp(&a.item.ms));
    (total, focus, items)
}

pub fn summarize(ctx: &Ctx, rows: &[SpanRow], audio: &[SpanRow], calls: &[SpanRow]) -> Summary {
    let mut active = 0;
    let mut afk = 0;
    let mut productive = 0;
    let mut distracting = 0;
    let mut first = None;
    let mut last = None;
    let mut switches = 0u32;
    let mut prev_app: Option<&str> = None;
    let mut cats: HashMap<Option<i64>, i64> = HashMap::new();
    let mut apps: HashMap<&str, (i64, &str, HashMap<&str, i64>)> = HashMap::new();
    let mut app_cat_ms: HashMap<(&str, Option<i64>), i64> = HashMap::new();
    let mut domains: HashMap<&str, (i64, HashMap<&str, i64>)> = HashMap::new();

    for r in rows {
        let d = dur(r);
        if d == 0 {
            continue;
        }
        if r.afk {
            afk += d;
            continue;
        }
        active += d;
        first = Some(first.map_or(r.start, |f: i64| f.min(r.start)));
        last = Some(last.map_or(r.end, |l: i64| l.max(r.end)));
        if prev_app.is_some_and(|p| p != r.app_key) {
            switches += 1;
        }
        prev_app = Some(&r.app_key);
        let cat = ctx.cat(r);
        *cats.entry(cat).or_default() += d;
        match ctx.kind(cat) {
            "productive" => productive += d,
            "distracting" => distracting += d,
            _ => {}
        }
        let a = apps.entry(&r.app_key).or_insert((0, &r.display, HashMap::new()));
        a.0 += d;
        *a.2.entry(&r.title).or_default() += d;
        *app_cat_ms.entry((&r.app_key, cat)).or_default() += d;
        if let Some(dom) = r.domain.as_deref() {
            let e = domains.entry(dom).or_insert((0, HashMap::new()));
            e.0 += d;
            *e.1.entry(&r.title).or_default() += d;
        }
    }


    let app_cat = |key: &str| {
        app_cat_ms.iter().filter(|((k, _), _)| *k == key).max_by_key(|(_, ms)| **ms).and_then(|((_, c), _)| *c)
    };

    let app_mixed = |key: &str, total: i64| {
        let mut parts: Vec<i64> = app_cat_ms.iter().filter(|((k, _), _)| *k == key).map(|(_, ms)| *ms).collect();
        parts.sort_unstable_by(|a, b| b.cmp(a));
        parts.get(1).is_some_and(|second| *second * 5 > total)
    };
    let top_titles = |m: HashMap<&str, i64>| {
        sorted_totals(m).into_iter().filter(|(t, _)| !t.is_empty()).take(5).map(|(t, ms)| (t.to_string(), ms)).collect()
    };
    let mut app_items: Vec<LedgerItem> = apps
        .into_iter()
        .map(|(k, (ms, display, titles))| LedgerItem {
            key: k.to_string(),
            label: display.to_string(),
            cat: app_cat(k),
            mixed: app_mixed(k, ms),
            ms,
            titles: top_titles(titles),
        })
        .collect();
    app_items.sort_by(|a, b| b.ms.cmp(&a.ms));
    let mut dom_items: Vec<LedgerItem> = domains
        .into_iter()
        .map(|(k, (ms, titles))| LedgerItem {
            key: k.to_string(),
            label: k.to_string(),
            cat: ctx.classifier.classify("", Some(k), ""),
            mixed: false,
            ms,
            titles: top_titles(titles),
        })
        .collect();
    dom_items.sort_by(|a, b| b.ms.cmp(&a.ms));

    let (background_ms, background_focus_ms, background) = background_items(ctx, rows, audio);
    let (call_ms, _, calls) = background_items(ctx, rows, calls);
    Summary {
        background_ms,
        background_focus_ms,
        background,
        call_ms,
        calls,
        active_ms: active,
        afk_ms: afk,
        productive_ms: productive,
        distracting_ms: distracting,
        first_ms: first,
        last_ms: last,
        switches,
        focus: focus_streak(ctx, rows),
        categories: sorted_totals(cats).into_iter().map(|(id, ms)| CatTotal { id, ms }).collect(),
        apps: app_items,
        domains: dom_items,
    }
}

pub fn day_view(ctx: &Ctx, rows: &[SpanRow], audio: &[SpanRow], calls: &[SpanRow], start: i64, end: i64) -> DayView {
    let n = ((end - start + MIN - 1) / MIN).max(0) as usize;
    let mut cells: Vec<Cell> = Vec::new();
    let mut cell_ix: HashMap<(&str, Option<&str>, &str), u32> = HashMap::new();
    let mut per_min: Vec<Vec<(u32, i64)>> = vec![Vec::new(); n];
    let mut afk_min: Vec<i64> = vec![0; n];

    for r in rows {
        if dur(r) == 0 {
            continue;
        }
        let ix = if r.afk {
            None
        } else {
            let key = (r.app_key.as_str(), r.domain.as_deref(), r.title.as_str());
            Some(*cell_ix.entry(key).or_insert_with(|| {
                cells.push(Cell {
                    app: r.app_key.clone(),
                    display: r.display.clone(),
                    title: r.title.clone(),
                    domain: r.domain.clone(),
                    cat: ctx.cat(r),
                });
                (cells.len() - 1) as u32
            }))
        };
        let mut t = r.start;
        while t < r.end {
            let m = ((t - start) / MIN) as usize;
            if m >= n {
                break;
            }
            let bucket_end = (start + (m as i64 + 1) * MIN).min(r.end);
            let ms = bucket_end - t;
            match ix {
                None => afk_min[m] += ms,
                Some(i) => match per_min[m].iter_mut().find(|(c, _)| *c == i) {
                    Some(e) => e.1 += ms,
                    None => per_min[m].push((i, ms)),
                },
            }
            t = bucket_end;
        }
    }

    let minutes = per_min
        .iter()
        .zip(&afk_min)
        .map(|(v, afk)| {
            let active: i64 = v.iter().map(|x| x.1).sum();
            if active >= 1000 && active >= *afk {
                v.iter().max_by_key(|x| x.1).map(|x| x.0 as i32).unwrap_or(-1)
            } else if *afk >= 20_000 {
                -2
            } else {
                -1
            }
        })
        .collect();

    let background = segments(ctx, audio, start);
    let call_segs = segments(ctx, calls, start);
    DayView { start, end, minutes, cells, background, calls: call_segs, summary: summarize(ctx, rows, audio, calls) }
}


fn segments(ctx: &Ctx, rows: &[SpanRow], start: i64) -> Vec<BgSeg> {
    let mut background: Vec<BgSeg> = vec![];
    for r in rows.iter().filter(|r| dur(r) > 0) {
        let from = (r.start - start) / MIN;
        let to = ((r.end - start + MIN - 1) / MIN).max(from + 1);

        let key = r.domain.clone().unwrap_or_else(|| r.app_key.clone());
        if let Some(last) = background.iter_mut().rev().find(|b| b.app == key) {
            if from <= last.to + 1 {
                last.to = last.to.max(to);
                continue;
            }
        }
        let display = r.domain.as_ref().map_or_else(|| r.display.clone(), |d| format!("{d} · {}", r.display));
        background.push(BgSeg { from, to, app: key, display, title: r.title.clone(), cat: ctx.cat(r) });
    }
    background
}

fn day_total(ctx: &Ctx, rows: &[SpanRow], start: i64, end: i64) -> DayTotal {
    let mut active = 0;
    let mut afk = 0;
    let mut cats: HashMap<Option<i64>, i64> = HashMap::new();
    let nh = ((end - start + HOUR - 1) / HOUR).max(0) as usize;
    let mut hours: Vec<HashMap<Option<i64>, i64>> = vec![HashMap::new(); nh];
    for r in rows.iter().filter(|r| r.start < end && r.end > start) {
        let (s, e) = (r.start.max(start), r.end.min(end));
        if e <= s {
            continue;
        }
        if r.afk {
            afk += e - s;
            continue;
        }
        active += e - s;
        let cat = ctx.cat(r);
        *cats.entry(cat).or_default() += e - s;
        let mut t = s;
        while t < e {
            let h = ((t - start) / HOUR) as usize;
            if h >= nh {
                break;
            }
            let be = (start + (h as i64 + 1) * HOUR).min(e);
            *hours[h].entry(cat).or_default() += be - t;
            t = be;
        }
    }
    DayTotal {
        start,
        end,
        active_ms: active,
        afk_ms: afk,
        categories: sorted_totals(cats).into_iter().map(|(id, ms)| CatTotal { id, ms }).collect(),
        hours: hours
            .into_iter()
            .map(|m| HourCell { active_ms: m.values().sum(), cat: m.into_iter().max_by_key(|x| x.1).and_then(|x| x.0) })
            .collect(),
    }
}


pub fn range_view(ctx: &Ctx, rows: &[SpanRow], audio: &[SpanRow], calls: &[SpanRow], days: &[(i64, i64)]) -> RangeView {
    let start = days.first().map_or(0, |d| d.0);
    let end = days.last().map_or(0, |d| d.1);
    RangeView {
        start,
        end,
        days: days.iter().map(|(s, e)| day_total(ctx, rows, *s, *e)).collect(),
        summary: summarize(ctx, rows, audio, calls),
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GoalProgress {
    pub goal: Goal,
    pub used_ms: i64,
    pub ratio: f64,
}

pub fn goal_usage(ctx: &Ctx, goal: &Goal, rows: &[SpanRow]) -> i64 {
    rows.iter()
        .filter(|r| !r.afk)
        .filter(|r| match goal.target_kind.as_str() {
            "total" => true,
            "category" => ctx.cat(r).map(|c| c.to_string()) == Some(goal.target.clone()),
            "app" => r.app_key == goal.target,
            "domain" => r.domain.as_deref().is_some_and(|d| crate::classify::domain_matches(d, &goal.target)),
            _ => false,
        })
        .map(dur)
        .sum()
}

pub fn goal_progress(ctx: &Ctx, goal: &Goal, rows: &[SpanRow]) -> GoalProgress {
    let used = goal_usage(ctx, goal, rows);
    let target = (goal.minutes.max(1) * MIN) as f64;
    GoalProgress { goal: goal.clone(), used_ms: used, ratio: used as f64 / target }
}


fn iso(ms: i64) -> String {
    use chrono::{Local, TimeZone};
    Local.timestamp_millis_opt(ms).single().map(|d| d.to_rfc3339()).unwrap_or_default()
}

fn csv_field(s: &str) -> String {

    let s = if s.starts_with(['=', '+', '-', '@']) { format!("'{s}") } else { s.to_string() };
    if s.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s
    }
}


pub fn export(ctx: &Ctx, rows: &[SpanRow], audio: &[SpanRow], calls: &[SpanRow], cats: &[Category], format: &str) -> String {
    let mut all: Vec<(&SpanRow, &str)> = rows
        .iter()
        .map(|r| (r, if r.afk { "away" } else { "active" }))
        .chain(audio.iter().map(|r| (r, "background")))
        .chain(calls.iter().map(|r| (r, "call")))
        .collect();
    all.sort_by_key(|(r, _)| r.start);
    let cat_name = |id: Option<i64>| {
        id.and_then(|i| cats.iter().find(|c| c.id == i)).map(|c| c.name.clone()).unwrap_or_else(|| "Uncategorised".into())
    };
    if format == "json" {
        let items: Vec<_> = all
            .iter()
            .map(|(r, kind)| {
                serde_json::json!({
                    "start": iso(r.start),
                    "end": iso(r.end),
                    "durationSeconds": dur(r) as f64 / 1000.0,
                    "app": r.app_key,
                    "appName": r.display,
                    "title": r.title,
                    "domain": r.domain,
                    "category": if r.afk { "Away".to_string() } else { cat_name(ctx.cat(r)) },
                    "kind": kind,
                })
            })
            .collect();
        serde_json::to_string_pretty(&items).unwrap_or_default()
    } else {
        let mut out = String::from("start,end,duration_s,app,app_name,title,domain,category,kind\n");
        for (r, kind) in &all {
            let cat = if r.afk { "Away".to_string() } else { cat_name(ctx.cat(r)) };
            out.push_str(&format!(
                "{},{},{:.1},{},{},{},{},{},{}\n",
                iso(r.start),
                iso(r.end),
                dur(r) as f64 / 1000.0,
                csv_field(&r.app_key),
                csv_field(&r.display),
                csv_field(&r.title),
                csv_field(r.domain.as_deref().unwrap_or("")),
                csv_field(&cat),
                kind
            ));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::classify::Rule;

    fn row(start_min: i64, end_min: i64, app: &str, afk: bool) -> SpanRow {
        SpanRow {
            start: start_min * MIN,
            end: end_min * MIN,
            app_key: app.into(),
            display: app.into(),
            title: format!("{app} title"),
            domain: None,
            afk,
        }
    }

    fn fixture() -> (Classifier, Vec<Category>) {
        let rules = vec![
            Rule { id: 1, priority: 0, match_type: "app".into(), pattern: "code".into(), category_id: 1 },
            Rule { id: 2, priority: 0, match_type: "app".into(), pattern: "reddit".into(), category_id: 2 },
        ];
        let cats = vec![
            Category { id: 1, name: "Deep Work".into(), slot: 1, kind: "productive".into() },
            Category { id: 2, name: "Social".into(), slot: 2, kind: "distracting".into() },
        ];
        (Classifier::new(rules), cats)
    }

    #[test]
    fn focus_tolerates_blips_but_not_long_distractions() {
        let (c, cats) = fixture();
        let ctx = Ctx::new(&c, &cats);
        let mut rows = vec![row(0, 30, "code", false)];
        rows.push(SpanRow { start: 30 * MIN, end: 30 * MIN + 20_000, ..row(0, 0, "reddit", false) });
        rows.push(SpanRow { start: 30 * MIN + 20_000, end: 60 * MIN, ..row(0, 0, "code", false) });
        rows.push(row(60, 80, "reddit", false));
        rows.push(row(80, 90, "code", false));
        let s = focus_streak(&ctx, &rows).unwrap();
        assert_eq!(s.start, 0);
        assert_eq!(s.end, 60 * MIN);
        assert_eq!(s.ms, 60 * MIN - 20_000);
    }

    #[test]
    fn focus_breaks_on_gap() {
        let (c, cats) = fixture();
        let ctx = Ctx::new(&c, &cats);
        let rows = vec![row(0, 10, "code", false), row(20, 50, "code", false)];
        assert_eq!(focus_streak(&ctx, &rows).unwrap().ms, 30 * MIN);
    }

    #[test]
    fn day_view_minutes() {
        let (c, cats) = fixture();
        let ctx = Ctx::new(&c, &cats);
        let rows = vec![row(0, 2, "code", false), row(2, 4, "x", true), row(4, 5, "reddit", false)];
        let v = day_view(&ctx, &rows, &[], &[], 0, 6 * MIN);
        assert_eq!(v.minutes.len(), 6);
        assert_eq!(v.minutes[..], [0, 0, -2, -2, 1, -1]);
        assert_eq!(v.cells[0].cat, Some(1));
        assert_eq!(v.summary.active_ms, 3 * MIN);
        assert_eq!(v.summary.afk_ms, 2 * MIN);
        assert_eq!(v.summary.productive_ms, 2 * MIN);
        assert_eq!(v.summary.distracting_ms, MIN);
        assert_eq!(v.summary.switches, 1);
    }

    #[test]
    fn range_view_splits_days_and_hours() {
        let (c, cats) = fixture();
        let ctx = Ctx::new(&c, &cats);
        let day = 24 * 60;
        let rows = vec![row(day - 30, day + 30, "code", false)];
        let v = range_view(&ctx, &rows, &[], &[], &[(0, day * MIN), (day * MIN, 2 * day * MIN)]);
        assert_eq!(v.days[0].active_ms, 30 * MIN);
        assert_eq!(v.days[1].active_ms, 30 * MIN);
        assert_eq!(v.days[0].hours[23].active_ms, 30 * MIN);
        assert_eq!(v.days[1].hours[0].cat, Some(1));
    }

    #[test]
    fn background_audio_never_counts_as_active() {
        let (c, cats) = fixture();
        let ctx = Ctx::new(&c, &cats);
        let rows = vec![row(0, 60, "code", false)];
        let audio = vec![row(0, 30, "spotify", false), row(30, 31, "spotify", false), row(40, 50, "spotify", false)];
        let v = day_view(&ctx, &rows, &audio, &audio[..1], 0, 60 * MIN);
        assert_eq!(v.summary.call_ms, 30 * MIN);
        assert_eq!(v.calls.len(), 1);
        assert_eq!(v.summary.active_ms, 60 * MIN);
        assert_eq!(v.summary.background_ms, 41 * MIN);
        let bg = &v.summary.background[0];
        assert_eq!(bg.item.key, "spotify");

        assert_eq!(bg.during.iter().map(|d| d.1).sum::<i64>() + bg.away_ms, 41 * MIN);
        assert_eq!(bg.away_ms, 0);
        assert_eq!(bg.during.len(), 1);
        assert_eq!(v.background.len(), 2, "{:?}", v.background);
        assert_eq!((v.background[0].from, v.background[0].to), (0, 31));
    }

    #[test]
    fn goals() {
        let (c, cats) = fixture();
        let ctx = Ctx::new(&c, &cats);
        let rows = vec![row(0, 30, "code", false), row(30, 90, "reddit", false), row(90, 100, "x", true)];
        let g = Goal { id: 1, target_kind: "category".into(), target: "2".into(), period: "day".into(), op: "max".into(), minutes: 30 };
        let p = goal_progress(&ctx, &g, &rows);
        assert_eq!(p.used_ms, 60 * MIN);
        assert!((p.ratio - 2.0).abs() < 1e-9);
        let t = Goal { target_kind: "total".into(), ..g };
        assert_eq!(goal_usage(&ctx, &t, &rows), 90 * MIN);
    }

    #[test]
    fn export_formats() {
        let (c, cats) = fixture();
        let ctx = Ctx::new(&c, &cats);
        let mut r = row(0, 1, "code", false);
        r.title = "=cmd, \"quoted\"".into();
        let csv = export(&ctx, &[r.clone()], &[], &[], &cats, "csv");
        let line = csv.lines().nth(1).unwrap();
        assert!(line.contains("\"'=cmd, \"\"quoted\"\"\""));
        assert!(line.ends_with(",Deep Work,active"));
        let json: serde_json::Value = serde_json::from_str(&export(&ctx, &[r.clone()], &[r.clone()], &[r], &cats, "json")).unwrap();
        assert_eq!(json[2]["kind"], "call");
        assert_eq!(json[1]["kind"], "background");
        assert_eq!(json[0]["category"], "Deep Work");
        assert_eq!(json[0]["durationSeconds"], 60.0);
    }
}
