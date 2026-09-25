

use serde::Serialize;


pub const DRIFT_NUDGE_MS: i64 = 60_000;

pub const NUDGE_EVERY_MS: i64 = 5 * 60_000;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FocusSession {
    pub start: i64,
    pub end: i64,
    pub planned_ms: i64,
    pub drift_ms: i64,

    pub drift_run_ms: i64,
    #[serde(skip)]
    last_nudge: i64,
    #[serde(skip)]
    last_tick: i64,
}

#[derive(Debug, PartialEq)]
pub enum FocusEvent {
    Drift { run_ms: i64 },
    Done,
}

impl FocusSession {
    pub fn new(now: i64, minutes: i64) -> Self {
        let planned_ms = minutes.clamp(5, 240) * 60_000;
        Self { start: now, end: now + planned_ms, planned_ms, drift_ms: 0, drift_run_ms: 0, last_nudge: i64::MIN / 2, last_tick: now }
    }


    pub fn tick(&mut self, now: i64, distracting: bool) -> Option<FocusEvent> {
        let dt = (now - self.last_tick).clamp(0, 2_000);
        self.last_tick = now;
        if now >= self.end {
            return Some(FocusEvent::Done);
        }
        if distracting {
            self.drift_ms += dt;
            self.drift_run_ms += dt;
            if self.drift_run_ms >= DRIFT_NUDGE_MS && now - self.last_nudge >= NUDGE_EVERY_MS {
                self.last_nudge = now;
                return Some(FocusEvent::Drift { run_ms: self.drift_run_ms });
            }
        } else {
            self.drift_run_ms = 0;
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nudges_after_a_minute_of_drift_then_waits() {
        let mut s = FocusSession::new(0, 25);
        let mut events = vec![];
        for t in 1..=400 {
            if let Some(e) = s.tick(t * 1000, true) {
                events.push((t, e));
            }
        }
        assert_eq!(events[0], (60, FocusEvent::Drift { run_ms: 60_000 }));
        assert_eq!(events[1].0, 360);
        assert_eq!(s.drift_ms, 400_000);
    }

    #[test]
    fn short_blips_do_not_nudge() {
        let mut s = FocusSession::new(0, 25);
        for t in 1..=600 {
            let distracting = t % 50 < 30;
            assert_eq!(s.tick(t * 1000, distracting), None);
        }
        assert!(s.drift_ms > 0);
    }

    #[test]
    fn finishes_at_planned_end() {
        let mut s = FocusSession::new(0, 5);
        assert_eq!(s.tick(299_000, false), None);
        assert_eq!(s.tick(300_000, false), Some(FocusEvent::Done));
    }
}
