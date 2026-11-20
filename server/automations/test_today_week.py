"""Today / week labels from the due date (20 Nov 2026, #575)."""
import os
import sys
import unittest
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import webhook_listener as wl  # noqa: E402

T, W = 5, 9
FRI = date(2026, 11, 20)


def task(due='', labels=()):
    return {'id': 1, 'due_date': due or '0001-01-01T00:00:00Z', 'labels': [{'id': i} for i in labels]}


class TodayWeek(unittest.TestCase):
    def ch(self, t):
        return wl.today_week_changes(t, FRI, T, W)

    def test_due_today_or_late_gets_today(self):
        self.assertEqual(self.ch(task('2026-11-20T15:00:00Z')), ({T}, set()))
        self.assertEqual(self.ch(task('2026-11-10T09:00:00Z')), ({T}, set()))

    def test_due_this_week_gets_week(self):
        self.assertEqual(self.ch(task('2026-11-22T10:00:00Z')), ({W}, set()))

    def test_due_next_week_nothing(self):
        self.assertEqual(self.ch(task('2026-11-23T10:00:00Z')), (set(), set()))

    def test_already_today_no_week(self):
        self.assertEqual(self.ch(task('2026-11-22T10:00:00Z', [T])), (set(), set()))

    def test_due_today_on_week_moves_to_today(self):
        self.assertEqual(self.ch(task('2026-11-20T10:00:00Z', [W])), ({T}, {W}))

    def test_both_by_hand_keeps_today(self):
        self.assertEqual(self.ch(task('', [T, W])), (set(), {W}))

    def test_no_date_nothing(self):
        self.assertEqual(self.ch(task()), (set(), set()))

    def test_sunday_end(self):
        self.assertEqual(wl.end_of_week(date(2026, 11, 22)), date(2026, 11, 22))
        self.assertEqual(wl.end_of_week(date(2026, 11, 16)), date(2026, 11, 22))


if __name__ == '__main__':
    unittest.main()
