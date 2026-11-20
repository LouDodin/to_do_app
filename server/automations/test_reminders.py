"""Tests for reminders.py (19 Nov 2026): run with python -m unittest test_reminders."""
import json
import os
import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone

import reminders

NOW = datetime(2026, 11, 19, 15, 0, tzinfo=timezone.utc)


def make_root(rows, topic='lou-topic-x'):
    root = tempfile.mkdtemp()
    os.makedirs(os.path.join(root, 'vikunja', 'db'))
    os.makedirs(os.path.join(root, 'state'))
    with open(os.path.join(root, 'vikunja', 'publicurl.txt'), 'w') as f:
        f.write('https://pc.example.ts.net/\n')
    con = sqlite3.connect(os.path.join(root, 'vikunja', 'db', 'vikunja.db'))
    con.executescript("""
        create table users (id integer primary key, username text, frontend_settings text);
        create table projects (id integer primary key, title text, owner_id integer);
        create table tasks (id integer primary key, title text, done integer, project_id integer);
        create table task_reminders (id integer primary key, task_id integer, reminder datetime, created datetime, relative_period integer, relative_to text);
    """)
    con.execute('insert into users values (1, "lou", ?)', (json.dumps({'tasks_alert_topic': topic}),))
    con.execute('insert into users values (2, "other", ?)', (json.dumps({}),))
    con.execute('insert into projects values (10, "Work", 1)')
    con.execute('insert into projects values (11, "Bin", 1)')
    con.execute('insert into projects values (20, "Theirs", 2)')
    for rid, tid, title, done, pid, when in rows:
        con.execute('insert into tasks values (?, ?, ?, ?)', (tid, title, done, pid))
        con.execute('insert into task_reminders values (?, ?, ?, "2026-11-19 10:00:00", 0, "")', (rid, tid, when))
    con.commit()
    con.close()
    return root


class Reminders(unittest.TestCase):
    def setUp(self):
        self.sent = []

    def send(self, topic, title, body, click='', tags=''):
        self.sent.append((topic, title, body, click))
        return True

    def test_due_one_is_sent_once_with_a_generic_text_and_a_link(self):
        root = make_root([(1, 100, 'Secret dentist', 0, 10, '2026-11-19 14:59:00')])
        self.assertEqual(reminders.check(root, self.send, NOW), 1)
        topic, title, body, click = self.sent[0]
        self.assertEqual(topic, 'lou-topic-x')
        self.assertNotIn('dentist', title + body)
        self.assertEqual(click, 'https://pc.example.ts.net:8443/task/100')
        self.assertEqual(reminders.check(root, self.send, NOW), 0)  # not twice

    def test_not_yet_done_bin_and_no_topic_are_skipped(self):
        root = make_root([
            (1, 100, 'later', 0, 10, '2026-11-19 15:30:00'),
            (2, 101, 'done', 1, 10, '2026-11-19 14:00:00'),
            (3, 102, 'binned', 0, 11, '2026-11-19 14:00:00'),
            (4, 103, 'no topic', 0, 20, '2026-11-19 14:00:00'),
        ])
        self.assertEqual(reminders.check(root, self.send, NOW), 0)

    def test_late_is_marked_and_very_late_dropped(self):
        root = make_root([(1, 100, 'late', 0, 10, '2026-11-19 13:00:00'), (2, 101, 'old', 0, 10, '2026-11-18 01:00:00')])
        self.assertEqual(reminders.check(root, self.send, NOW), 1)
        self.assertIn('late', self.sent[0][1])

    def test_a_moved_reminder_rings_again(self):
        root = make_root([(1, 100, 't', 0, 10, '2026-11-19 14:00:00')])
        reminders.check(root, self.send, NOW)
        con = sqlite3.connect(os.path.join(root, 'vikunja', 'db', 'vikunja.db'))
        con.execute('update task_reminders set reminder = "2026-11-19 14:55:00" where id = 1')
        con.commit()
        con.close()
        self.assertEqual(reminders.check(root, self.send, NOW), 1)

    def test_a_failed_send_is_tried_again_next_minute(self):
        root = make_root([(1, 100, 't', 0, 10, '2026-11-19 14:59:00')])
        self.assertEqual(reminders.check(root, lambda *a, **k: False, NOW), 0)
        self.assertEqual(reminders.check(root, self.send, NOW), 1)

    def test_vikunja_date_formats(self):
        for s in ('2026-11-19 14:59:00', '2026-11-19T14:59:00Z', '2026-11-19 14:59:00.123+00:00'):
            self.assertEqual(reminders._utc(s), datetime(2026, 11, 19, 14, 59, tzinfo=timezone.utc))


if __name__ == '__main__':
    unittest.main()
