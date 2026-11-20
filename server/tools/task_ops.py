"""Changes to the main account's own tasks, asked through Claude from the Mac (6 Nov 2026):
requests\\task-ops.request holds JSON {"ops": [{"id": 332, "project": 52, "validate": true,
"done": true}, ...]}. For each task, in this order: validate (adds the hidden ctx:validated mark),
move to a project, mark done. Each task is read first and sent back whole (Vikunja empties the
fields an update leaves out). Uses the main account's key (state/automation-token.txt) on the PC
itself; the key is never shown. Writes one line per task to stdout (titles only).

Only these three changes exist: nothing is ever deleted.
"""
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = os.environ.get('TASKS_VIKUNJA_API', 'http://127.0.0.1:3456') + '/api/v1'
TOKEN = (ROOT / 'state' / 'automation-token.txt').read_text(encoding='utf-8').strip()


def call(method, path, body=None, tries=5):
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(tries):
        req = urllib.request.Request(API + path, data=data, method=method,
                                     headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                txt = r.read().decode('utf-8')
                return json.loads(txt) if txt else None
        except urllib.error.HTTPError as e:
            # Vikunja's database is busy for a moment ("database is locked", 500): try again
            # (6 Nov 2026: one task of the first run failed that way).
            if e.code != 500 or attempt == tries - 1:
                raise
            time.sleep(1.5 * (attempt + 1))


def validated_label_id():
    page = 1
    while True:
        labels = call('GET', f'/labels?page={page}&per_page=50') or []
        for l in labels:
            if l.get('title', '').strip().lower() == 'ctx:validated':
                return l['id']
        if len(labels) < 50:
            return None
        page += 1


def main(path):
    ops = json.loads(pathlib.Path(path).read_text(encoding='utf-8-sig')).get('ops', [])
    vid = None
    bad = 0
    for op in ops:
        tid = int(op['id'])
        try:
            task = call('GET', f'/tasks/{tid}')
            title = task.get('title', '')
            done_what = []
            if op.get('validate'):
                if not any(l.get('title') == 'ctx:validated' for l in task.get('labels') or []):
                    vid = vid or validated_label_id() or call('PUT', '/labels', {'title': 'ctx:validated', 'hex_color': '4caf50'})['id']
                    if vid:
                        try:
                            call('PUT', f'/tasks/{tid}/labels', {'label_id': vid})
                        except urllib.error.HTTPError as e:
                            if e.code not in (400, 409):
                                raise
                done_what.append('validated')
            changed = False
            if op.get('project') and task.get('project_id') != int(op['project']):
                task['project_id'] = int(op['project'])
                changed = True
                done_what.append(f"moved to project {op['project']}")
            if op.get('done') and not task.get('done'):
                task['done'] = True
                changed = True
                done_what.append('completed')
            if changed:
                task = call('POST', f'/tasks/{tid}', task)
            print(f"OK   #{tid} {title}: {', '.join(done_what) or 'nothing to change'}")
        except Exception as e:  # noqa: BLE001
            bad += 1
            print(f"XX   #{tid}: {e}")
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
