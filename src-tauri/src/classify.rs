

use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Rule {
    pub id: i64,
    pub priority: i64,
    pub match_type: String,
    pub pattern: String,
    pub category_id: i64,
}

enum Matcher {
    App(String),
    Domain(String),
    Title(Result<Regex, String>),
}

pub struct Classifier {
    rules: Vec<(Matcher, i64)>,
    cache: parking_lot::Mutex<HashMap<(String, Option<String>, String), Option<i64>>>,
}

fn specificity(t: &str) -> i64 {
    match t {
        "domain" => 3,
        "title" => 2,
        _ => 1,
    }
}

pub fn domain_matches(domain: &str, pattern: &str) -> bool {
    domain == pattern || domain.strip_suffix(pattern).is_some_and(|rest| rest.ends_with('.'))
}

impl Classifier {
    pub fn new(mut rules: Vec<Rule>) -> Self {


        rules.sort_by(|a, b| {
            specificity(&b.match_type)
                .cmp(&specificity(&a.match_type))
                .then(b.priority.cmp(&a.priority))
                .then(b.id.cmp(&a.id))
        });
        let rules = rules
            .into_iter()
            .map(|r| {
                let m = match r.match_type.as_str() {
                    "domain" => Matcher::Domain(r.pattern.trim().to_lowercase()),
                    "title" => Matcher::Title(
                        Regex::new(&format!("(?i){}", r.pattern)).map_err(|_| r.pattern.to_lowercase()),
                    ),
                    _ => Matcher::App(r.pattern.trim().to_lowercase()),
                };
                (m, r.category_id)
            })
            .collect();
        Self { rules, cache: Default::default() }
    }

    pub fn classify(&self, app: &str, domain: Option<&str>, title: &str) -> Option<i64> {
        let key = (app.to_string(), domain.map(str::to_string), title.to_string());
        if let Some(hit) = self.cache.lock().get(&key) {
            return *hit;
        }
        let res = self.rules.iter().find_map(|(m, cat)| {
            let hit = match m {
                Matcher::App(p) => p == app,
                Matcher::Domain(p) => domain.is_some_and(|d| domain_matches(d, p)),
                Matcher::Title(Ok(re)) => re.is_match(title),
                Matcher::Title(Err(sub)) => title.to_lowercase().contains(sub.as_str()),
            };
            hit.then_some(*cat)
        });
        let mut c = self.cache.lock();
        if c.len() > 50_000 {
            c.clear();
        }
        c.insert(key, res);
        res
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(id: i64, priority: i64, t: &str, p: &str, cat: i64) -> Rule {
        Rule { id, priority, match_type: t.into(), pattern: p.into(), category_id: cat }
    }

    #[test]
    fn domain_beats_app_at_equal_priority() {
        let c = Classifier::new(vec![r(1, 0, "app", "firefox", 7), r(2, 0, "domain", "youtube.com", 5)]);
        assert_eq!(c.classify("firefox", Some("youtube.com"), ""), Some(5));
        assert_eq!(c.classify("firefox", Some("m.youtube.com"), ""), Some(5));
        assert_eq!(c.classify("firefox", Some("notyoutube.com"), ""), Some(7));
        assert_eq!(c.classify("firefox", None, ""), Some(7));
    }

    #[test]
    fn user_rule_beats_seed_of_same_type() {
        let c = Classifier::new(vec![r(1, 0, "domain", "youtube.com", 5), r(9, 100, "domain", "youtube.com", 3)]);
        assert_eq!(c.classify("firefox", Some("youtube.com"), ""), Some(3));
    }

    #[test]
    fn recategorising_a_browser_keeps_site_rules() {
        let c = Classifier::new(vec![r(1, 0, "domain", "youtube.com", 5), r(9, 100, "app", "firefox", 7)]);
        assert_eq!(c.classify("firefox", Some("youtube.com"), ""), Some(5));
        assert_eq!(c.classify("firefox", Some("unknown.org"), ""), Some(7));
    }

    #[test]
    fn title_regex_and_fallback() {
        let c = Classifier::new(vec![r(1, 0, "title", r"\bjira\b", 1), r(2, 0, "title", "([bad", 2)]);
        assert_eq!(c.classify("x", None, "PROJ-1 - JIRA board"), Some(1));
        assert_eq!(c.classify("x", None, "has ([bad inside"), Some(2));
        assert_eq!(c.classify("x", None, "nothing"), None);
    }

    #[test]
    fn newest_wins_on_tie() {
        let c = Classifier::new(vec![r(1, 100, "app", "code", 1), r(2, 100, "app", "code", 3)]);
        assert_eq!(c.classify("code", None, ""), Some(3));
    }
}
