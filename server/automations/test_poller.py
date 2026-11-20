"""Unit tests for the PC / Mac split of webhook_listener.py (no server needed).
Run:  python -X utf8 -m unittest test_poller -v
"""
import os
import shutil
import tempfile
import unittest

import webhook_listener as wl


class Split(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.saved = {k: getattr(wl, k) for k in ("STATE_FILE", "ROLE_FILE", "LOG_FILE", "ERRORS_LOG_FILE",
                                                  "NOTIFY_STATE_FILE", "DAILY_STATE_FILE", "WEEKLY_STATE_FILE",
                                                  "PENDING_TASK_IDS_STATE_FILE", "ROLE_OVERRIDE")}
        for k in ("STATE_FILE", "ROLE_FILE", "ERRORS_LOG_FILE", "NOTIFY_STATE_FILE", "DAILY_STATE_FILE",
                  "WEEKLY_STATE_FILE", "PENDING_TASK_IDS_STATE_FILE"):
            setattr(wl, k, os.path.join(self.d, os.path.basename(self.saved[k])))
        wl.LOG_FILE = os.path.join(self.d, "log.txt")
        self.calls = []
        self.patched = {}
        fakes = {
            "get_projects_and_pending": lambda: ([], None, set()),
            "sync_area_folders": lambda: self.calls.append("folders"),
            "paginated_tasks": lambda f=None: self.calls.append(f"tasks:{f}") or [],
            "sync_due_date_labels": lambda p: self.calls.append("due"),
            "sync_saved_filters": lambda p: self.calls.append("filters"),
            "run_weekly_checks": lambda p: self.calls.append("weekly"),
            "get_pending_project_ids": lambda: set(),
            "run_daily_checks": lambda: self.calls.append("daily"),
            "resolve_automation_labels": lambda: None,
        }
        for name, fn in fakes.items():
            self.patched[name] = getattr(wl, name)
            setattr(wl, name, fn)

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(wl, k, v)
        for k, v in self.patched.items():
            setattr(wl, k, v)
        os.environ.pop("AUTOMATION_ROLE", None)
        shutil.rmtree(self.d)

    def run_role(self, role):
        wl.ROLE_OVERRIDE = role
        self.calls = []
        wl.poll_once()
        return self.calls

    def test_server_role_does_labels_not_folders(self):
        calls = self.run_role("server")
        self.assertIn("due", calls)
        self.assertIn("filters", calls)
        self.assertIn("daily", calls)
        self.assertNotIn("folders", calls)
        self.assertNotIn("weekly", calls)
        self.assertTrue(os.path.exists(wl.STATE_FILE))  # the "since" checkpoint moves on

    def test_folders_role_does_folders_only(self):
        calls = self.run_role("folders")
        self.assertEqual(calls, ["folders", "weekly"])
        self.assertFalse(os.path.exists(wl.STATE_FILE))  # never touches the labels checkpoint

    def test_all_role_does_everything(self):
        calls = self.run_role("all")
        for step in ("folders", "due", "filters", "weekly", "daily"):
            self.assertIn(step, calls)

    def test_role_from_file_then_environment(self):
        wl.ROLE_OVERRIDE = None
        self.assertEqual(wl.current_role(), "all")  # nothing set: same as before the split
        wl.write_state(wl.ROLE_FILE, "folders\n")
        self.assertEqual(wl.current_role(), "folders")
        os.environ["AUTOMATION_ROLE"] = "server"
        self.assertEqual(wl.current_role(), "server")

    def test_unknown_role_runs_nothing_and_reports(self):
        wl.ROLE_OVERRIDE = None
        wl.write_state(wl.ROLE_FILE, "both")
        before = wl.ERROR_COUNT
        self.calls = []
        wl.poll_once()
        self.assertEqual(self.calls, [])
        self.assertEqual(wl.ERROR_COUNT, before + 1)


class WindowsSafety(unittest.TestCase):
    def test_no_token_in_the_code(self):
        here = os.path.dirname(os.path.abspath(__file__))
        with open(os.path.join(here, "webhook_listener.py"), encoding="utf-8") as f:
            self.assertNotRegex(f.read(), r"tk_[0-9a-f]{20,}")

    def test_token_from_file(self):
        d = tempfile.mkdtemp()
        try:
            p = os.path.join(d, "t.txt")
            with open(p, "w", encoding="utf-8") as f:
                f.write("tk_test\n")
            saved, wl.TOKEN_FILE = wl.TOKEN_FILE, p
            os.environ.pop("VIKUNJA_TOKEN", None)
            self.assertEqual(wl.get_token(), "tk_test")
            wl.TOKEN_FILE = os.path.join(d, "missing.txt")
            with self.assertRaises(RuntimeError):
                wl.get_token()
            wl.TOKEN_FILE = saved
        finally:
            shutil.rmtree(d)

    def test_log_accepts_accents_and_emoji(self):
        d = tempfile.mkdtemp()
        saved, wl.LOG_FILE = wl.LOG_FILE, os.path.join(d, "a.log")
        try:
            wl.log("Tâche « Réunion » ✅")
            with open(wl.LOG_FILE, encoding="utf-8") as f:
                self.assertIn("Réunion", f.read())
        finally:
            wl.LOG_FILE = saved
            shutil.rmtree(d)

    def test_write_state_replaces_whole_file(self):
        d = tempfile.mkdtemp()
        try:
            p = os.path.join(d, "s", "x.txt")
            wl.write_state(p, "a" * 100)
            wl.write_state(p, "b")
            self.assertEqual(wl.read_state(p, None), "b")
            self.assertFalse(os.path.exists(p + ".tmp"))
        finally:
            shutil.rmtree(d)


class DamagedState(unittest.TestCase):
    """10 Oct 2026: a sudden restart left pending_task_ids_last.txt full of zero bytes, and the
    pending-task step failed every minute for a week."""

    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.saved = (wl.PENDING_TASK_IDS_STATE_FILE, wl.LOG_FILE)
        wl.PENDING_TASK_IDS_STATE_FILE = os.path.join(self.d, "p.txt")
        wl.LOG_FILE = os.path.join(self.d, "log.txt")

    def tearDown(self):
        wl.PENDING_TASK_IDS_STATE_FILE, wl.LOG_FILE = self.saved
        shutil.rmtree(self.d)

    def test_zero_bytes_count_as_unknown(self):
        with open(wl.PENDING_TASK_IDS_STATE_FILE, "wb") as f:
            f.write(b"\x00" * 232)
        self.assertIsNone(wl.read_pending_task_ids_state())
        self.assertEqual(wl.read_state(wl.PENDING_TASK_IDS_STATE_FILE, "x"), "x")

    def test_missing_is_unknown_but_empty_is_known(self):
        self.assertIsNone(wl.read_pending_task_ids_state())
        wl.write_pending_task_ids_state(set())
        self.assertEqual(wl.read_pending_task_ids_state(), set())  # "nothing pending" is known
        wl.write_pending_task_ids_state({3, 1})
        self.assertEqual(wl.read_pending_task_ids_state(), {1, 3})

    def test_unknown_state_restarts_without_touching_dates(self):
        calls = []
        saved = (wl.get_projects_and_pending, wl.paginated_tasks, wl.update_task, wl.STATE_FILE, wl.ROLE_OVERRIDE)
        wl.get_projects_and_pending = lambda: ([], None, {9})
        wl.paginated_tasks = lambda f=None: [{"id": 1, "project_id": 9, "start_date": "2026-01-01T00:00:00Z"}] if f is None else []
        wl.update_task = lambda tid, fields: calls.append((tid, fields))
        wl.STATE_FILE = os.path.join(self.d, "since.txt")
        wl.ROLE_OVERRIDE = "server"
        wl.LABELS_RESOLVED = True
        for n in ("sync_due_date_labels", "sync_saved_filters", "_run_daily_checks_if_due"):
            setattr(self, n, getattr(wl, n)); setattr(wl, n, lambda *a: None)
        try:
            with open(wl.PENDING_TASK_IDS_STATE_FILE, "wb") as f:
                f.write(b"\x00" * 50)
            wl.poll_once()
            self.assertEqual(calls, [])  # no start date cleared
            self.assertEqual(wl.read_pending_task_ids_state(), {1})  # tracking works again
        finally:
            (wl.get_projects_and_pending, wl.paginated_tasks, wl.update_task, wl.STATE_FILE, wl.ROLE_OVERRIDE) = saved
            for n in ("sync_due_date_labels", "sync_saved_filters", "_run_daily_checks_if_due"):
                setattr(wl, n, getattr(self, n))

    def test_damaged_checkpoint_is_replaced(self):
        saved = wl.STATE_FILE
        wl.STATE_FILE = os.path.join(self.d, "since.txt")
        try:
            with open(wl.STATE_FILE, "wb") as f:
                f.write(b"\x00" * 20)
            self.assertIsNone(wl.read_state(wl.STATE_FILE, None))
        finally:
            wl.STATE_FILE = saved


if __name__ == "__main__":
    unittest.main()


class AccountLabels(unittest.TestCase):
    """26 Oct 2026: every account has its own automation labels, found by name."""

    def setUp(self):
        self.saved = {k: getattr(wl, k) for k in ("get_all_labels", "api_request", "log", "NEXT_ACTION_LABEL_ID", "TODAY_LABEL_ID",
                                                    "OVERDUE_LABEL_ID", "LAST_DAY_LABEL_ID", "PROTECTED_LABEL_IDS", "LABELS_RESOLVED")}
        self.created = []
        wl.log = lambda m: None
        def put(method, path, payload=None):
            self.created.append(payload["title"])
            return {"id": 900 + len(self.created), **payload}
        wl.api_request = put

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(wl, k, v)

    def test_found_by_name_oldest_first(self):
        wl.get_all_labels = lambda: [{"id": 40, "title": "Next-Action"}, {"id": 7, "title": "next-action"}, {"id": 8, "title": "today"},
                                     {"id": 9, "title": "overdue"}, {"id": 10, "title": "last-day"}, {"id": 4, "title": "dad"}]
        wl.resolve_automation_labels()
        self.assertEqual((wl.NEXT_ACTION_LABEL_ID, wl.TODAY_LABEL_ID, wl.OVERDUE_LABEL_ID, wl.LAST_DAY_LABEL_ID), (7, 8, 9, 10))
        self.assertEqual(wl.PROTECTED_LABEL_IDS, {7, 8, 9, 10})
        self.assertEqual(self.created, [])

    def test_a_new_account_gets_the_missing_labels(self):
        wl.get_all_labels = lambda: [{"id": 50, "title": "today"}]
        wl.resolve_automation_labels()
        self.assertEqual(self.created, ["next-action", "overdue", "last-day"])
        self.assertEqual(wl.TODAY_LABEL_ID, 50)
        self.assertNotIn(4, wl.PROTECTED_LABEL_IDS)  # never another account's ids

    def test_label_steps_skipped_when_labels_cannot_be_found(self):
        calls = []
        saved = {k: getattr(wl, k) for k in ("get_projects_and_pending", "sync_due_date_labels", "notify_error", "ROLE_OVERRIDE", "paginated_tasks", "STATE_FILE")}
        d = tempfile.mkdtemp()
        try:
            wl.LABELS_RESOLVED = False
            wl.get_all_labels = lambda: (_ for _ in ()).throw(RuntimeError("HTTP 500"))
            wl.get_projects_and_pending = lambda: ([], None, set())
            wl.paginated_tasks = lambda f=None: []
            wl.sync_due_date_labels = lambda p: calls.append("due")
            wl.notify_error = lambda src, msg: calls.append(src)
            wl.ROLE_OVERRIDE = "server"
            wl.STATE_FILE = os.path.join(d, "since.txt")
            wl.poll_once()
            self.assertIn("automation labels", calls)
            self.assertNotIn("due", calls)
        finally:
            for k, v in saved.items():
                setattr(wl, k, v)
            shutil.rmtree(d)


class FullUpdates(unittest.TestCase):
    """26 Oct 2026: an update sends every current value, so Vikunja empties nothing."""

    def test_task_update_keeps_the_other_fields(self):
        sent = []
        saved = (wl.get_task, wl.api_request)
        wl.get_task = lambda tid: {"id": tid, "title": "T", "description": "notes", "due_date": "2026-11-05T10:00:00Z", "priority": 3,
                                   "done": False, "project_id": 7, "labels": [{"id": 1}]}
        wl.api_request = lambda m, path, payload=None: sent.append((m, path, payload))
        try:
            wl.update_task(5, {"start_date": "2026-10-26T10:00:00Z"})
        finally:
            wl.get_task, wl.api_request = saved
        m, path, p = sent[0]
        self.assertEqual((m, path), ("POST", "/api/v1/tasks/5"))
        self.assertEqual((p["due_date"], p["description"], p["priority"], p["title"], p["start_date"]),
                         ("2026-11-05T10:00:00Z", "notes", 3, "T", "2026-10-26T10:00:00Z"))
        self.assertNotIn("labels", p)

    def test_project_update_keeps_title_and_description(self):
        sent = []
        saved = (wl.api_get, wl.api_request)
        wl.api_get = lambda path: {"id": 9, "title": "P", "description": "[pending]", "parent_project_id": 3, "position": 5}
        wl.api_request = lambda m, path, payload=None: sent.append(payload)
        try:
            wl.update_project(9, {"parent_project_id": 0})
        finally:
            wl.api_get, wl.api_request = saved
        self.assertEqual(sent[0], {"title": "P", "description": "[pending]", "parent_project_id": 0, "position": 5})
