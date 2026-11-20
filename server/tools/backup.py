"""Backup of the Vikunja database (safe while Vikunja is running). Keeps 30 days.

Run every night at 03:00 by the scheduled task "Vikunja backup", and by scripts that change
things (update, restore, export). Writes backups/vikunja-<date>_<time>.db, checks the copy
(integrity + it can be read), logs one line in backups/backup.log. Exit code 1 on failure.
"""
import datetime
import pathlib
import sqlite3
import sys

root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'vikunja' / 'db' / 'vikunja.db'
dst_dir = root / 'backups'
dst_dir.mkdir(exist_ok=True)
now = datetime.datetime.now()
dst = dst_dir / f"vikunja-{now:%Y-%m-%d_%H%M%S}.db"
log = dst_dir / 'backup.log'


def write_log(text):
    with open(log, 'a', encoding='utf-8') as f:
        f.write(f"{datetime.datetime.now():%Y-%m-%d %H:%M} {text}\n")


try:
    s = sqlite3.connect(f"file:{src}?mode=ro", uri=True, timeout=30)
    d = sqlite3.connect(dst)
    s.backup(d)
    ok = d.execute('pragma integrity_check').fetchone()[0]
    try:
        n = d.execute('select count(*) from tasks where deleted_at is null').fetchone()[0]
    except sqlite3.OperationalError:
        n = d.execute('select count(*) from tasks').fetchone()[0]
    d.close()
    s.close()
except Exception as e:  # noqa: BLE001
    write_log(f"FAILED {e}")
    print('backup FAILED:', e)
    sys.exit(1)

cutoff = now - datetime.timedelta(days=30)
for f in dst_dir.glob('vikunja-*.db'):
    if datetime.datetime.fromtimestamp(f.stat().st_mtime) < cutoff:
        f.unlink()
write_log(f"{dst.name} integrity={ok} tasks={n}")
print(dst.name, ok, n)
sys.exit(0 if ok == 'ok' else 1)
