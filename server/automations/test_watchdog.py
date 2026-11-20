"""Unit tests for the pure decisions in watchdog.py.  Run: python3 -m unittest test_watchdog -v"""
import os
import tempfile
import unittest
from datetime import datetime

import watchdog as w


class PollerAlert(unittest.TestCase):
    def test_healthy_resets_the_counter(self):
        msg, st = w.decide_poller_alert(30, {"consecutive_bad": 1}, 1000)
        self.assertIsNone(msg)
        self.assertEqual(st["consecutive_bad"], 0)

    def test_first_bad_reading_is_only_logged(self):
        msg, st = w.decide_poller_alert(900, {}, 1000)
        self.assertIsNone(msg)
        self.assertEqual(st["consecutive_bad"], 1)

    def test_second_bad_reading_alerts_then_cools_down(self):
        _, st = w.decide_poller_alert(900, {}, 1000)
        msg, st = w.decide_poller_alert(1100, st, 1200)
        self.assertIn("18 min", msg)
        msg2, st = w.decide_poller_alert(1200, st, 1300)
        self.assertIsNone(msg2)  # cooldown
        msg3, _ = w.decide_poller_alert(1500, st, 1200 + w.NOTIFY_COOLDOWN_SECONDS + 1)
        self.assertIsNotNone(msg3)

    def test_missing_heartbeat_counts_as_bad(self):
        _, st = w.decide_poller_alert(None, {}, 1)
        msg, _ = w.decide_poller_alert(None, st, 2)
        self.assertIn("No heartbeat file", msg)

    def test_boundary_five_minutes_is_still_healthy(self):
        msg, st = w.decide_poller_alert(w.HEARTBEAT_STALE_SECONDS, {}, 1)
        self.assertEqual(st["consecutive_bad"], 0)


class Schedule(unittest.TestCase):
    def test_due(self):
        self.assertTrue(w.due({}, "k", 1800, 100))
        self.assertFalse(w.due({"k": 100}, "k", 1800, 1000))
        self.assertTrue(w.due({"k": 100}, "k", 1800, 1900))

    def test_heartbeat_age(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "hb")
            self.assertIsNone(w.heartbeat_age(p))
            with open(p, "w", encoding="utf-8") as f:
                f.write("2026-10-08T11:59:00Z")
            self.assertEqual(w.heartbeat_age(p, datetime(2026, 10, 8, 12, 0, 0)), 60)

    def test_one_failing_job_does_not_stop_the_next(self):
        ran = []
        w.mac_notify = lambda *a: None
        w.run_isolated("a", lambda: 1 / 0)
        w.run_isolated("b", lambda: ran.append("b"))
        self.assertEqual(ran, ["b"])


if __name__ == "__main__":
    unittest.main()
