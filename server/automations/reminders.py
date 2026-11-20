"""Task reminders on the phone (19 Nov 2026).

A reminder set on a task in the app (task page > Remind) is kept by Vikunja (table
task_reminders). Vikunja itself only sends reminders by e-mail, which is not set up here. This
module, called every minute by run_poller.py, sends a phone notification through ntfy instead, to
the topic of the task's owner (the one set in the app, Help > Alerts; account setting
tasks_alert_topic). An account without a topic gets nothing.

The topic is a public channel: the text is generic, never the task's title. A tap on the
notification opens the task in the app (its number only is in the link).

Each reminder is sent once (state/reminders-sent.json). A reminder more than 30 minutes late (the
PC was asleep or off) is still sent, marked "late"; one more than 12 hours late is dropped.
The database is only read, never written.
"""
import json
import os
import sqlite3
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone

LATE_AFTER = timedelta(minutes=30)
DROP_AFTER = timedelta(hours=12)
KEEP_SENT = timedelta(days=3)


def _utc(s):
    """Vikunja's SQLite dates: 'YYYY-MM-DD HH:MM:SS' in UTC (sometimes with a fraction or a zone)."""
    s = str(s).replace('T', ' ').replace('Z', '')
    s = s.split('+')[0].split('.')[0].strip()
    return datetime.strptime(s, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)


def due_reminders(db_path, now=None):
    """[(key, task_id, topic, late)] of the reminders whose time has come, for open tasks
    outside the Bin, whose owner has a topic. key identifies the reminder and its time."""
    now = now or datetime.now(timezone.utc)
    con = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True, timeout=5)
    try:
        rows = con.execute(
            """select r.id, r.task_id, r.reminder, u.frontend_settings
                 from task_reminders r
                 join tasks t on t.id = r.task_id
                 join projects p on p.id = t.project_id
                 join users u on u.id = p.owner_id
                where t.done = 0 and p.title != 'Bin' and r.reminder <= ?""",
            (now.strftime('%Y-%m-%d %H:%M:%S'),),
        ).fetchall()
    finally:
        con.close()
    out = []
    for rid, task_id, when, settings in rows:
        try:
            at = _utc(when)
        except ValueError:
            continue
        if now - at > DROP_AFTER:
            continue
        try:
            topic = (json.loads(settings or '{}') or {}).get('tasks_alert_topic') or ''
        except ValueError:
            topic = ''
        topic = str(topic).strip()
        if not topic:
            continue
        out.append((f'{rid}|{at:%Y-%m-%dT%H:%M}', task_id, topic, now - at > LATE_AFTER))
    return out


def app_url(root):
    """https://<this PC>:8443 from vikunja/publicurl.txt, or '' when unknown."""
    try:
        with open(os.path.join(root, 'vikunja', 'publicurl.txt'), encoding='utf-8-sig') as f:
            u = f.read().strip().rstrip('/')
    except OSError:
        return ''
    return f'{u}:8443' if u.startswith('https://') else ''


def send_ntfy(topic, title, body, click='', tags='alarm_clock'):
    """True when ntfy took it. Same way as the health check: Python, then Windows' curl."""
    server = topic if '://' in topic else 'https://ntfy.sh/' + topic
    headers = {'Title': title, 'Priority': '4', 'Tags': tags}
    if click:
        headers['Click'] = click
    try:
        req = urllib.request.Request(server, data=body.encode('utf-8'), method='POST', headers=headers)
        urllib.request.urlopen(req, timeout=10)
        return True
    except Exception:  # noqa: BLE001
        pass
    if sys.platform == 'win32':
        cmd = ['curl.exe', '-s', '-f', '-m', '15', '-d', body] + [x for k, v in headers.items() for x in ('-H', f'{k}: {v}')] + [server]
        try:
            return subprocess.run(cmd, capture_output=True, timeout=20, creationflags=0x08000000).returncode == 0
        except Exception:  # noqa: BLE001
            return False
    return False


def check(root, send=send_ntfy, now=None, log=lambda m: None):
    """Sends the reminders whose time has come. Returns how many were sent."""
    db = os.path.join(root, 'vikunja', 'db', 'vikunja.db')
    if not os.path.isfile(db):
        return 0
    ledger_file = os.path.join(root, 'state', 'reminders-sent.json')
    try:
        with open(ledger_file, encoding='utf-8') as f:
            sent = json.load(f)
    except (OSError, ValueError):
        sent = {}
    now = now or datetime.now(timezone.utc)
    url = app_url(root)
    n = 0
    for key, task_id, topic, late in due_reminders(db, now):
        if key in sent:
            continue
        title = 'Tasks: reminder' + (' (late)' if late else '')
        body = 'A task you asked to be reminded of. Tap to open it.'
        if send(topic, title, body, f'{url}/task/{task_id}' if url else ''):
            sent[key] = now.timestamp()
            n += 1
            log(f'reminder sent for task {task_id}' + (' (late)' if late else ''))
    cutoff = (now - KEEP_SENT).timestamp()
    sent = {k: v for k, v in sent.items() if v >= cutoff}
    if n or os.path.isfile(ledger_file):
        os.makedirs(os.path.dirname(ledger_file), exist_ok=True)
        tmp = ledger_file + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(sent, f)
        os.replace(tmp, ledger_file)
    return n


if __name__ == '__main__':
    here = os.path.dirname(os.path.abspath(__file__))
    print(check(os.path.dirname(here), log=print), 'sent')
