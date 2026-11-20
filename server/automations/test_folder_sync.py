import os, shutil, tempfile, unittest
import folder_sync as fs

def P(id, title, parent=0, created="2026-09-19T10:00:00Z", desc="", archived=False, updated="2026-09-19T10:00:00Z"):
    return {"id": id, "title": title, "parent_project_id": parent, "created": created, "description": desc, "is_archived": archived, "updated": updated}

class T(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.root = os.path.join(self.d, "areas")
        os.makedirs(os.path.join(self.root, "HEALTH"))
        os.makedirs(os.path.join(self.root, "PHD", "admin"))
        self.state = os.path.join(self.d, "state.json")
        self.msgs = []
    def tearDown(self):
        shutil.rmtree(self.d)
    def run_sync(self, projects, today="261008", apply=True):
        s = fs.Sync(self.root, self.state, log=lambda m: None, notify=lambda k, m: self.msgs.append(m), today=today, apply=apply)
        s.run(projects)
        return s
    def ls(self, rel=""):
        return sorted(os.listdir(os.path.join(self.root, rel)))

    def test_create_and_idempotent(self):
        ps = [P(1, "HEALTH"), P(2, "do_sports", 1)]
        self.run_sync(ps)
        self.assertEqual(self.ls("HEALTH"), ["190926_do_sports".replace("190926", "260919")])
        s = self.run_sync(ps)
        self.assertEqual(s.actions, [])

    def test_ignores_inbox_bin_unplaced_and_never_touches_other_folders(self):
        ps = [P(1, "HEALTH"), P(2, "INBOX"), P(3, "Bin"), P(4, "Maison"), P(5, "sub", 4), P(6, "PHD")]
        self.run_sync(ps)
        self.assertEqual(self.ls("HEALTH"), [])
        self.assertEqual(self.ls("PHD"), ["admin"])
        self.assertNotIn("Maison", self.ls())

    def test_nested(self):
        ps = [P(1, "HEALTH"), P(2, "do_sports", 1), P(3, "run", 2, created="2026-09-20T10:00:00Z")]
        self.run_sync(ps)
        self.assertEqual(self.ls("HEALTH/260919_do_sports"), ["260920_run"])

    def test_pending_unpend_archive_restore_cycle(self):
        base = [P(1, "HEALTH")]
        self.run_sync(base + [P(2, "do_sports", 1, desc="[pending]\n")])
        self.assertEqual(self.ls("HEALTH/pending_projects"), ["do_sports"])
        os.makedirs(os.path.join(self.root, "HEALTH/pending_projects/do_sports/my files"))
        self.run_sync(base + [P(2, "do_sports", 1, desc="[start:2026-10-08]\n")])
        self.assertEqual(self.ls("HEALTH"), ["261008_do_sports", "pending_projects"])
        self.assertEqual(self.ls("HEALTH/261008_do_sports"), ["my files"])
        self.run_sync(base + [P(2, "do_sports", 1, desc="[start:2026-10-08]\n[end:2026-12-02]\n", archived=True)])
        self.assertEqual(self.ls("HEALTH/archived_projects"), ["261008_261202_do_sports"])
        self.run_sync(base + [P(2, "do_sports", 1, desc="[start:2026-10-08]\n")])
        self.assertEqual(self.ls("HEALTH"), ["261008_do_sports", "archived_projects", "pending_projects"])
        self.run_sync(base + [P(2, "do_sports", 1, desc="[pending]\n")])
        self.assertEqual(self.ls("HEALTH/pending_projects"), ["do_sports"])

    def test_archive_example_from_the_brief(self):
        self.run_sync([P(1, "HEALTH"), P(2, "do_sports", 1)])
        self.run_sync([P(1, "HEALTH"), P(2, "do_sports", 1, archived=True, desc="[end:2026-12-02]\n")])
        self.assertEqual(self.ls("HEALTH/archived_projects"), ["260919_261202_do_sports"])

    def test_move_to_another_area_and_rename_keep_contents(self):
        self.run_sync([P(1, "HEALTH"), P(9, "PHD"), P(2, "do_sports", 1)])
        with open(os.path.join(self.root, "HEALTH/260919_do_sports/notes.txt"), "w") as f: f.write("x")
        self.run_sync([P(1, "HEALTH"), P(9, "PHD"), P(2, "do_sports", 9)])
        self.assertEqual(self.ls("PHD"), ["260919_do_sports", "admin"])
        self.assertTrue(os.path.exists(os.path.join(self.root, "PHD/260919_do_sports/notes.txt")))
        self.run_sync([P(1, "HEALTH"), P(9, "PHD"), P(2, "do_exercise", 9)])
        self.assertEqual(self.ls("PHD"), ["260919_do_exercise", "admin"])

    def test_moving_a_parent_carries_children(self):
        a = [P(1, "HEALTH"), P(9, "PHD"), P(2, "big", 1), P(3, "small", 2)]
        self.run_sync(a)
        self.run_sync([P(1, "HEALTH"), P(9, "PHD"), P(2, "big", 9), P(3, "small", 2)])
        self.assertEqual(self.ls("PHD/260919_big"), ["260919_small"])
        self.assertEqual(self.ls("HEALTH"), [])

    def test_human_edited_prefix_is_kept(self):
        os.makedirs(os.path.join(self.root, "HEALTH/250101_do_sports"))
        self.run_sync([P(1, "HEALTH"), P(2, "do_sports", 1)])
        self.assertEqual(self.ls("HEALTH"), ["250101_do_sports"])

    def test_name_clash_is_reported_and_nothing_overwritten(self):
        self.run_sync([P(1, "HEALTH"), P(2, "a", 1)])
        os.makedirs(os.path.join(self.root, "HEALTH/pending_projects/a"))
        self.run_sync([P(1, "HEALTH"), P(2, "a", 1, desc="[pending]\n")])
        self.assertTrue(self.msgs and "already exists" in self.msgs[0])
        self.assertEqual(self.ls("HEALTH"), ["260919_a", "pending_projects"])

    def test_two_folders_for_one_title_is_ambiguous(self):
        os.makedirs(os.path.join(self.root, "HEALTH/260101_x"))
        os.makedirs(os.path.join(self.root, "HEALTH/260202_x"))
        self.run_sync([P(1, "HEALTH"), P(2, "x", 1)])
        self.assertTrue(self.msgs)
        self.assertEqual(self.ls("HEALTH"), ["260101_x", "260202_x"])

    def test_legacy_pending_tree(self):
        self.run_sync([P(1, "HEALTH"), P(5, "PENDING"), P(6, "HEALTH", 5), P(7, "old_idea", 6)])
        self.assertEqual(self.ls("HEALTH/pending_projects"), ["old_idea"])

    def test_dry_run_changes_nothing(self):
        s = self.run_sync([P(1, "HEALTH"), P(2, "do_sports", 1)], apply=False)
        self.assertTrue(s.actions)
        self.assertEqual(self.ls("HEALTH"), [])
        self.assertFalse(os.path.exists(self.state))

    def test_missing_root_does_nothing(self):
        shutil.rmtree(self.root)
        self.run_sync([P(1, "HEALTH")])
        self.assertTrue(self.msgs)
        self.assertFalse(os.path.exists(self.root))

    def test_awkward_characters(self):
        self.run_sync([P(1, "HEALTH"), P(2, "a/b: c", 1)])
        self.assertEqual(self.ls("HEALTH"), ["260919_a-b- c"])

if __name__ == "__main__":
    unittest.main()
