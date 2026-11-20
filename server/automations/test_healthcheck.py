"""Unit tests for healthcheck.py — synthetic data only, no server, no real database.
Run:  python3 -m unittest test_healthcheck -v
"""
import os
import sqlite3
import tempfile
import time
import unittest
from datetime import date, datetime, timedelta, timezone

import healthcheck as hc

T0 = datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc)


def write_file(path, content, mode="w"):
    """Closes the file at once: Windows cannot delete a temporary folder holding an open file."""
    with open(path, mode, **({} if "b" in mode else {"encoding": "utf-8"})) as f:
        f.write(content)


def task(i, title="t", done=False, due=None, start="2026-09-01T10:00:00Z", project=1, labels=(), created="2026-09-01T10:00:00Z"):
    return {"id": i, "title": title, "done": done, "due": due, "start": start, "project_id": project,
            "created": created, "labels": set(labels)}


def snap(tasks=(), labels=None, projects=None, relations=(), filters=()):
    labels = labels if labels is not None else [{"id": i, "title": n} for i, n in hc.PROTECTED.items()]
    projects = projects if projects is not None else [{"id": 1, "title": "P", "parent": 0, "archived": False, "description": ""}]
    return {"tasks": list(tasks), "labels": labels, "projects": projects, "relations": list(relations), "filters": list(filters)}


class Normalisation(unittest.TestCase):
    def test_case_accents_emoji_ignored(self):
        self.assertEqual(hc.norm("  Café ☕  Plan "), hc.norm("cafe plan"))

    def test_symbols_are_kept(self):
        self.assertNotEqual(hc.norm("<60"), hc.norm(">60"))

    def test_parse_dt(self):
        self.assertIsNone(hc.parse_dt("0001-01-01T00:00:00Z"))
        self.assertIsNone(hc.parse_dt(None))
        self.assertEqual(hc.parse_dt("2026-10-08 14:50:03").hour, 14)


class Duplicates(unittest.TestCase):
    def test_labels(self):
        s = snap(labels=[{"id": 1, "title": "Think"}, {"id": 2, "title": "think "}, {"id": 3, "title": "<60"}, {"id": 4, "title": ">60"}])
        r = hc.check_duplicate_labels(s)
        self.assertEqual(r.level, "warn")
        self.assertEqual(len(r.items), 1)

    def test_projects_only_same_level(self):
        P = lambda i, t, par: {"id": i, "title": t, "parent": par, "archived": False, "description": ""}
        self.assertEqual(hc.check_duplicate_projects(snap(projects=[P(1, "Admin", 10), P(2, "Admin", 20), P(10, "A", 0), P(20, "B", 0)])).level, "ok")
        self.assertEqual(hc.check_duplicate_projects(snap(projects=[P(1, "Admin", 10), P(2, "admin", 10), P(10, "A", 0)])).level, "warn")

    def test_filters_ignore_numbering(self):
        r = hc.check_duplicate_filters(snap(filters=[{"id": 1, "title": "7. Groceries", "filter": ""}, {"id": 2, "title": "Groceries", "filter": ""}]))
        self.assertEqual(r.level, "warn")


class DueLabels(unittest.TestCase):
    today = date(2026, 10, 8)

    def run_check(self, due, labels, done=False):
        return hc.check_due_labels(snap([task(1, due=due, labels=labels, done=done)]), today=self.today).level

    def test_overdue_needs_label(self):
        self.assertEqual(self.run_check("2026-10-06T21:59:00Z", []), "warn")
        self.assertEqual(self.run_check("2026-10-06T21:59:00Z", [112]), "ok")

    def test_today_needs_last_day(self):
        self.assertEqual(self.run_check("2026-10-08T21:59:00Z", [113]), "ok")
        self.assertEqual(self.run_check("2026-10-08T21:59:00Z", [112, 113]), "warn")

    def test_future_has_neither(self):
        self.assertEqual(self.run_check("2026-10-20T10:00:00Z", []), "ok")
        self.assertEqual(self.run_check("2026-10-20T10:00:00Z", [113]), "warn")

    def test_done_and_undated_are_ignored(self):
        self.assertEqual(self.run_check("2026-10-01T10:00:00Z", [], done=True), "ok")
        self.assertEqual(self.run_check("0001-01-01T00:00:00Z", []), "ok")


class Labels(unittest.TestCase):
    def test_protected_labels_missing(self):
        self.assertEqual(hc.check_protected_labels(snap(labels=[{"id": 4, "title": "next-action"}])).level, "fail")
        self.assertEqual(hc.check_protected_labels(snap()).level, "ok")

    def test_done_with_active_label(self):
        self.assertEqual(hc.check_done_with_active_labels(snap([task(1, done=True, labels=[112])])).level, "warn")
        self.assertEqual(hc.check_done_with_active_labels(snap([task(1, done=True)])).level, "ok")



class Structure(unittest.TestCase):
    def test_orphans(self):
        self.assertEqual(hc.check_orphans(snap([task(1, project=99)])).level, "fail")
        P = [{"id": 1, "title": "P", "parent": 0, "archived": True, "description": ""}]
        self.assertEqual(hc.check_orphans(snap([task(1)], projects=P)).level, "warn")
        self.assertEqual(hc.check_orphans(snap([task(1)])).level, "ok")

    def test_project_tree_loop_and_missing_parent(self):
        P = lambda i, par: {"id": i, "title": f"p{i}", "parent": par, "archived": False, "description": ""}
        self.assertEqual(hc.check_project_tree(snap(projects=[P(1, 2), P(2, 1)])).level, "fail")
        self.assertEqual(hc.check_project_tree(snap(projects=[P(1, 9)])).level, "warn")
        self.assertEqual(hc.check_project_tree(snap(projects=[P(1, 0), P(2, 1)])).level, "ok")

    def test_relations(self):
        ts = [task(1), task(2), task(3)]
        good = [(1, 2, "precedes"), (2, 1, "follows")]
        self.assertEqual(hc.check_relations(snap(ts, relations=good)).level, "ok")
        self.assertEqual(hc.check_relations(snap(ts, relations=[(1, 9, "precedes"), (9, 1, "follows")])).level, "warn")
        self.assertEqual(hc.check_relations(snap(ts, relations=[(1, 2, "precedes")])).level, "warn")  # one-sided
        cyc = [(1, 2, "precedes"), (2, 1, "follows"), (2, 1, "precedes"), (1, 2, "follows")]
        self.assertEqual(hc.check_relations(snap(ts, relations=cyc)).level, "fail")
        self.assertEqual(hc.check_relations(snap(ts, relations=[(1, 1, "precedes")])).level, "fail")  # a task before itself is a loop

    def test_copy_links_to_deleted_tasks_are_harmless(self):
        r = hc.check_relations(snap([task(1)], relations=[(1, 9, "copiedto"), (9, 1, "copiedfrom")]))
        self.assertEqual(r.level, "info")

    def test_filters_with_unknown_ids(self):
        f = [{"id": 1, "title": "A", "filter": "done = false && labels in 4, 999 && (project_id not in 1,77)"}]
        r = hc.check_filters(snap(filters=f))
        self.assertEqual(r.level, "warn")
        self.assertEqual(len(r.items), 2)


class Hints(unittest.TestCase):
    def test_copies(self):
        s = snap([task(1, "Plan"), task(2, "Plan_2"), task(3, "Other_2")])
        r = hc.check_possible_copies(s)
        self.assertEqual(r.level, "info")
        self.assertEqual(len(r.items), 1)

    def test_missing_start_ignores_fresh_tasks(self):
        fresh = (T0 - timedelta(minutes=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
        self.assertEqual(hc.check_missing_start(snap([task(1, start=None, created=fresh)]), now=T0).level, "ok")
        self.assertEqual(hc.check_missing_start(snap([task(1, start=None)]), now=T0).level, "info")

    def test_review_backlog(self):
        labels = [{"id": 60, "title": "ctx:review"}]
        self.assertEqual(hc.check_review_backlog(snap([task(1, labels=[60])], labels=labels)).level, "info")
        # Since 19 Oct 2026: without the "validated" mark, a task waits in the Inbox view.
        labels2 = [{"id": 61, "title": "ctx:validated"}]
        self.assertEqual(hc.check_review_backlog(snap([task(1, labels=[61])], labels=labels2)).level, "ok")
        self.assertEqual(hc.check_review_backlog(snap([task(1, labels=[61]), task(2)], labels=labels2)).level, "info")


class Runner(unittest.TestCase):
    def test_a_crashing_check_does_not_hide_the_others(self):
        broken = {"tasks": None, "labels": [], "projects": [], "relations": [], "filters": []}
        results = hc.run_checks(broken)
        self.assertEqual(len(results), len(hc.DATA_CHECKS))
        self.assertTrue(any("crashed" in r.summary for r in results))

    def test_render_and_exit_levels(self):
        text = hc.render([hc.Result("a", "ok", "fine"), hc.Result("b", "fail", "broken", ["x"])], "test")
        self.assertIn("[FAIL] b: broken", text)
        self.assertLess(text.index("FAIL"), text.index("[ok  ]"))


class Notifications(unittest.TestCase):
    def test_rate_limited_and_resets_on_recovery(self):
        with tempfile.TemporaryDirectory() as d:
            state = os.path.join(d, "s.json")
            sent = []
            fail = [hc.Result("db", "fail", "x")]
            self.assertEqual(hc.notify_failures(fail, state, now=1000, send=lambda *a: sent.append(a)), ["db"])
            self.assertEqual(hc.notify_failures(fail, state, now=1000 + 60, send=lambda *a: sent.append(a)), [])
            self.assertEqual(hc.notify_failures([hc.Result("db", "ok", "x")], state, now=2000), [])
            self.assertEqual(hc.notify_failures(fail, state, now=2100, send=lambda *a: sent.append(a)), ["db"])
            self.assertEqual(len(sent), 2)

    def test_warnings_never_notify(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(hc.notify_failures([hc.Result("a", "warn", "x")], os.path.join(d, "s.json"), now=1), [])


class SystemChecks(unittest.TestCase):
    def test_heartbeat(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "hb")
            self.assertEqual(hc.check_heartbeat(p).level, "fail")
            now = datetime(2026, 10, 8, 12, 0, 0)
            write_file(p, "2026-10-08T11:59:30Z", "w")
            self.assertEqual(hc.check_heartbeat(p, now=now).level, "ok")
            write_file(p, "2026-10-08T11:50:00Z", "w")
            self.assertEqual(hc.check_heartbeat(p, now=now).level, "fail")
            write_file(p, "garbage", "w")
            self.assertEqual(hc.check_heartbeat(p, now=now).level, "fail")

    def test_recent_errors(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "e.log")
            self.assertEqual(hc.check_recent_errors(p).level, "ok")
            write_file(p, "2026-10-08T10:00:00.1 [x] boom\n2026-09-01T10:00:00.1 [x] old\n", "w")
            r = hc.check_recent_errors(p, now=datetime(2026, 10, 8, 12, 0))
            self.assertEqual((r.level, len(r.items)), ("warn", 1))

    def test_backup_and_rotation(self):
        with tempfile.TemporaryDirectory() as d:
            db = os.path.join(d, "v.db")
            c = sqlite3.connect(db)
            c.execute("create table t(x)")
            c.execute("insert into t values (1)")
            c.commit()
            c.close()
            bdir = os.path.join(d, "backups")
            self.assertEqual(hc.check_backups(bdir).level, "warn")
            for n in range(5):
                hc.backup_database(db, bdir, keep=3, today=date(2026, 10, 1) + timedelta(days=n))
            self.assertEqual(len(os.listdir(bdir)), 3)
            _, made = hc.backup_database(db, bdir, keep=3, today=date(2026, 10, 5))
            self.assertFalse(made)  # once per day
            self.assertEqual(hc.check_backups(bdir).level, "ok")
            restored = sqlite3.connect(os.path.join(bdir, "vikunja-2026-10-05.db"))
            self.assertEqual(restored.execute("select x from t").fetchone()[0], 1)
            restored.close()
            self.assertEqual(hc.check_sqlite_integrity(db).level, "ok")

    def test_backup_fallback_when_the_live_file_cannot_be_opened(self):
        with tempfile.TemporaryDirectory() as d:
            db = os.path.join(d, "v.db")
            c = sqlite3.connect(db)
            c.execute("create table t(x)")
            c.execute("insert into t values (7)")
            c.commit()
            c.close()
            real = sqlite3.connect
            calls = {"n": 0}

            def flaky(*a, **k):  # the first open (the live file, read-only) fails like on the odd mount
                calls["n"] += 1
                if calls["n"] == 1:
                    raise sqlite3.OperationalError("disk I/O error")
                return real(*a, **k)

            hc.sqlite3.connect = flaky
            try:
                path, made = hc.backup_database(db, os.path.join(d, "b"), today=date(2026, 10, 8))
            finally:
                hc.sqlite3.connect = real
            self.assertTrue(made)
            copy = real(path)
            self.assertEqual(copy.execute("select x from t").fetchone()[0], 7)
            copy.close()

    def test_integrity_detects_a_broken_file(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "bad.db")
            write_file(p, b"this is not a database" * 100, "wb")
            self.assertEqual(hc.check_sqlite_integrity(p).level, "fail")


class FakeServer(unittest.TestCase):
    """load_api / check_api against a tiny local HTTP server that mimics Vikunja's answers."""

    @classmethod
    def setUpClass(cls):
        import json
        import threading
        from http.server import BaseHTTPRequestHandler, HTTPServer
        from urllib.parse import urlparse, parse_qs

        tasks = [{"id": i, "title": f"t{i}", "done": False, "project_id": 1, "due_date": "0001-01-01T00:00:00Z",
                  "start_date": "2026-09-01T00:00:00Z", "created": "2026-09-01T00:00:00Z",
                  "labels": [{"id": 4}], "related_tasks": ({"precedes": [{"id": 2}]} if i == 1 else {"follows": [{"id": 1}]} if i == 2 else {})}
                 for i in range(1, 121)]  # 120 tasks: forces three pages of 50

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                u = urlparse(self.path)
                q = parse_qs(u.query)
                if self.headers.get("Authorization") != "Bearer good":
                    self.send_response(401)
                    self.end_headers()
                    return
                page = int(q.get("page", ["1"])[0])
                size = int(q.get("per_page", ["50"])[0])
                if u.path == "/api/v1/tasks":
                    body = tasks[(page - 1) * size: page * size]
                elif u.path == "/api/v1/labels":
                    body = [{"id": 4, "title": "next-action"}] if page == 1 else []
                elif u.path == "/api/v1/projects":
                    body = [{"id": 1, "title": "P", "parent_project_id": 0}, {"id": -1, "title": "Groceries"}]
                elif u.path == "/api/v1/filters/0":
                    body = {"id": 1, "title": "Groceries", "filters": {"filter": "labels in 4"}}
                else:
                    body = {}
                data = json.dumps(body).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(data)

        cls.srv = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.old = hc.VIKUNJA_URL
        hc.VIKUNJA_URL = f"http://127.0.0.1:{cls.srv.server_port}"

    @classmethod
    def tearDownClass(cls):
        hc.VIKUNJA_URL = cls.old
        cls.srv.shutdown()

    def test_loads_every_page_and_relations_and_filters(self):
        s = hc.load_api("good")
        self.assertEqual(len(s["tasks"]), 120)
        self.assertIn((1, 2, "precedes"), s["relations"])
        self.assertEqual(s["filters"], [{"id": 1, "title": "Groceries", "filter": "labels in 4"}])
        self.assertEqual(s["tasks"][0]["labels"], {4})

    def test_server_check(self):
        self.assertEqual(hc.check_api("good").level, "ok")
        r = hc.check_api("wrong")
        self.assertEqual((r.level, "401" in r.summary), ("fail", True))
        self.assertEqual(hc.check_api(None).level, "fail")

    def test_unreachable_server_is_a_failure_not_a_crash(self):
        old = hc.VIKUNJA_URL
        hc.VIKUNJA_URL = "http://127.0.0.1:9"
        try:
            self.assertEqual(hc.check_api("good").level, "fail")
        finally:
            hc.VIKUNJA_URL = old


class BinAndFolders(unittest.TestCase):
    PROJ = [{"id": 1, "title": "P", "parent": 0, "archived": False, "description": ""},
            {"id": 9, "title": "Bin", "parent": 0, "archived": False, "description": ""}]

    def test_bin_tasks_are_kept_out_of_other_checks(self):
        sn = hc.split_bin(snap([task(1), task(2, project=9, start=None)], projects=self.PROJ))
        self.assertEqual([t["id"] for t in sn["tasks"]], [1])
        self.assertEqual([t["id"] for t in sn["bin"]], [2])
        self.assertEqual(hc.check_missing_start(sn, now=T0).level, "ok")

    def test_bin_levels(self):
        sn = hc.split_bin(snap([task(2, project=9)], projects=self.PROJ))
        self.assertEqual(hc.check_bin(sn, now=T0).level, "info")
        sn = hc.split_bin(snap([dict(task(3, project=9), updated="2026-08-01T10:00:00Z")], projects=self.PROJ))
        self.assertEqual(hc.check_bin(sn, now=T0).level, "warn")
        self.assertEqual(hc.check_bin(hc.split_bin(snap([], projects=self.PROJ)), now=T0).level, "ok")

    def test_project_folders(self):
        import json
        d = tempfile.mkdtemp()
        os.makedirs(os.path.join(d, "HEALTH", "260919_x"))
        st = os.path.join(d, "state.json")
        sn = snap(projects=[{"id": 2, "title": "x", "parent": 1, "archived": False, "description": ""}])
        self.assertEqual(hc.check_project_folders(sn, areas_dir=d, state_file=st).level, "info")  # not run yet
        write_file(st, json.dumps({"2": {"path": "HEALTH/260919_x", "status": "active", "title": "x"}}))
        self.assertEqual(hc.check_project_folders(sn, areas_dir=d, state_file=st).level, "ok")
        os.rename(os.path.join(d, "HEALTH", "260919_x"), os.path.join(d, "HEALTH", "moved"))
        self.assertEqual(hc.check_project_folders(sn, areas_dir=d, state_file=st).level, "warn")
        self.assertEqual(hc.check_project_folders(sn, areas_dir=d + "/nope", state_file=st).level, "warn")


class BinRelations(unittest.TestCase):
    def test_links_between_binned_tasks_are_not_dangling(self):
        s = snap(tasks=[task(1, project=1), task(35, project=57), task(60, project=57)],
                 projects=[{"id": 1, "title": "P", "parent": 0, "archived": False, "description": ""},
                           {"id": 57, "title": "Bin", "parent": 0, "archived": False, "description": ""}],
                 relations=[(35, 60, "precedes"), (60, 35, "follows")])
        s = hc.split_bin(s)
        self.assertEqual(hc.check_relations(s).level, "ok")


if __name__ == "__main__":
    unittest.main()
