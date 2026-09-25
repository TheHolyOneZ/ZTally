

use serde_json::Value;

include!(concat!(env!("OUT_DIR"), "/locales.rs"));

pub struct I18n {
    primary: Value,
    fallback: Value,
}

fn parse(code: &str) -> Value {
    LOCALES
        .iter()
        .find(|(c, _)| *c == code)
        .and_then(|(_, json)| serde_json::from_str(json).ok())
        .unwrap_or(Value::Null)
}


pub fn resolve(setting: &str) -> String {
    let has = |c: &str| LOCALES.iter().any(|(code, _)| code.eq_ignore_ascii_case(c));
    if setting != "auto" && has(setting) {
        return setting.to_string();
    }
    for loc in sys_locale::get_locales() {
        let loc = loc.replace('_', "-");
        if let Some((code, _)) = LOCALES.iter().find(|(c, _)| c.eq_ignore_ascii_case(&loc)) {
            return code.to_string();
        }
        let base = loc.split(['-', '.']).next().unwrap_or(&loc);
        let same_lang = |c: &str| c.split('-').next().unwrap_or(c).eq_ignore_ascii_case(base);
        if let Some((code, _)) = LOCALES.iter().find(|(c, _)| c.eq_ignore_ascii_case(base)).or_else(|| LOCALES.iter().find(|(c, _)| same_lang(c))) {
            return code.to_string();
        }
    }
    "en".into()
}

impl I18n {
    pub fn new(setting: &str) -> Self {
        Self { primary: parse(&resolve(setting)), fallback: parse("en") }
    }

    fn lookup<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
        key.split('.').try_fold(v, |cur, part| cur.get(part))?.as_str()
    }


    pub fn t(&self, key: &str, vars: &[(&str, String)]) -> String {
        let template = Self::lookup(&self.primary, key).or_else(|| Self::lookup(&self.fallback, key)).unwrap_or(key);
        let mut out = template.to_string();
        for (k, v) in vars {
            out = out.replace(&format!("{{{k}}}"), v);
        }
        out
    }


    pub fn category(&self, name: &str) -> String {
        let key = match name {
            "Deep Work" => "deepWork",
            "Social" => "social",
            "Learning" => "learning",
            "Communication" => "communication",
            "Entertainment" => "entertainment",
            "Creative" => "creative",
            "General" => "general",
            "Games" => "games",
            _ => return name.to_string(),
        };
        self.t(&format!("categories.defaults.{key}"), &[])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_locale_parses_and_english_is_complete() {
        assert!(LOCALES.iter().any(|(c, _)| *c == "en"));
        for (code, json) in LOCALES {
            let v: Value = serde_json::from_str(json).unwrap_or_else(|e| panic!("{code}.json is invalid: {e}"));
            assert!(v.get("_meta").and_then(|m| m.get("name")).is_some(), "{code}.json lacks _meta.name");
        }
        let en = I18n::new("en");
        assert_eq!(en.t("tray.today", &[("time", "2h".into())]), "Today · 2h");
        assert_eq!(en.t("no.such.key", &[]), "no.such.key");
        assert_eq!(en.category("Deep Work"), "Deep Work");
        assert_eq!(en.category("My stuff"), "My stuff");
    }

    #[test]
    fn falls_back_to_english_for_missing_keys() {
        let i = I18n { primary: serde_json::json!({ "tray": { "open": "Öffnen" } }), fallback: parse("en") };
        assert_eq!(i.t("tray.open", &[]), "Öffnen");
        assert_eq!(i.t("tray.quit", &[]), "Quit ZTally");
    }
}
