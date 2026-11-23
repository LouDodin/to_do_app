"""Health check for the to-do server (run every hour by the scheduled task "Tasks health check").

Writes:
  state/health.json         read by the app on every device (Settings > Server health, red banner)
  state/health-report.html  the same, readable, with how to fix each problem
  logs/health.log           one line per run

Each check is ok / warn / fail, with a "fix" telling what to do. Read-only: it never changes
the database, the app or any setting. One exception (12 Nov 2026): tools/pc-load.ps1 stops the
server's OWN scripts when one is stuck, or runs twice (never anything else on the PC).

Options:
  --base URL       Vikunja to test (default http://127.0.0.1:3456)
  --contract-only  only the API compatibility checks (used by update-vikunja.ps1 on a test copy)
  --quiet          no console output
"""
import datetime as dt
import json
import re
import os
import pathlib
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import acks  # noqa: E402  (tools/acks.py: "Got it" for me / for everyone, who sees what)
ROOT = HERE.parent
STATE = ROOT / 'state'
LOGS = ROOT / 'logs'
VK = ROOT / 'vikunja'
DB = VK / 'db' / 'vikunja.db'
TS = r'C:\Program Files\Tailscale\tailscale.exe'
WIN = sys.platform == 'win32'
DOCS = 'docs/TROUBLESHOOTING.md'
AUTO = ROOT / 'automations'
AUTO_STATE = STATE / 'automations'
AUTO_ENABLED = AUTO_STATE / 'enabled.txt'  # written by start-automations, removed by stop-automations

args = sys.argv[1:]
BASE = args[args.index('--base') + 1] if '--base' in args else 'http://127.0.0.1:3456'
CONTRACT_ONLY = '--contract-only' in args
QUIET = '--quiet' in args

checks = []


def add(name, status, detail='', fix='', account=None, cause=None, admin_only=False):
    """account: the one account this check concerns (its devices, its automations); None = the
    whole server, everyone. cause: which devices ("LouCanava · phone (Firefox, …)"). admin_only:
    shown to the admin only (30 Oct 2026, see tools/acks.py)."""
    c = {'name': name, 'status': status, 'detail': detail, 'fix': fix}
    if account:
        c['account'] = account
    if cause:
        c['cause'] = cause
    if admin_only:
        c['admin_only'] = True
    checks.append(c)


_main = []


def main_username():
    """The username of the main account (the admin: the one of state/automation-token.txt)."""
    if not _main:
        name = None
        try:
            owner = _token_owner(read_text(STATE / 'automation-token.txt').strip())
            if owner is not None:
                c = sqlite3.connect(f'file:{DB}?mode=ro', uri=True, timeout=10)
                row = c.execute('select username from users where id = ?', (owner,)).fetchone()
                c.close()
                name = row[0] if row else None
        except Exception:  # noqa: BLE001
            name = None
        _main.append(name)
    return _main[0]


def per_account_name(base, account):
    """The admin's own checks keep their usual name; another account's get " · <username>"."""
    return base if account and account == main_username() else f'{base} · {account or "unknown account"}'


def http_get(url, token=None, timeout=10):
    req = urllib.request.Request(url, headers={'User-Agent': 'tasks-healthcheck'})
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, dict(r.headers), r.read()


def run(cmd, timeout=20):
    try:
        p = subprocess.run(cmd, capture_output=True, timeout=timeout, creationflags=0x08000000 if WIN else 0)
        return p.returncode, (p.stdout or b'').decode('utf-8', 'replace'), (p.stderr or b'').decode('utf-8', 'replace')
    except Exception as e:  # noqa: BLE001
        return -1, '', str(e)


def read_text(p, default=''):
    try:
        return pathlib.Path(p).read_text(encoding='utf-8-sig').strip()
    except OSError:
        return default


# ---------------------------------------------------------------- Vikunja server
STARTUP_WAIT_S = 120


def check_vikunja():
    # Just after the PC starts (or a restart / update), Vikunja needs a moment: wait up to 2 minutes
    # before calling it down (22 Oct 2026: a check run during start-up raised a false alarm).
    deadline = time.time() + STARTUP_WAIT_S
    while True:
        try:
            http_get(f'{BASE}/api/v1/info')
            break
        except Exception:  # noqa: BLE001
            if time.time() >= deadline:
                break
            time.sleep(10)
    try:
        st, _, body = http_get(f'{BASE}/api/v1/info')
        info = json.loads(body)
        add('Vikunja server', 'ok', f"version {info.get('version')}")
        reg = info.get('auth', {}).get('local', {}).get('registration_enabled', info.get('registration_enabled'))
        if reg:
            add('Sign-ups', 'fail', 'Anyone can create an account on your public server',
                'Set VIKUNJA_SERVICE_ENABLEREGISTRATION=false in vikunja\\run-vikunja.cmd, then run scripts\\restart-server.bat.')
        else:
            add('Sign-ups', 'ok', 'closed')
        return info
    except Exception as e:  # noqa: BLE001
        add('Vikunja server', 'fail', f'not answering on {BASE} ({e})',
            'Run scripts\\restart-server.bat. If it still fails, see ' + DOCS + ' and send Claude the Error report.')
        return None


# ---------------------------------------------------------------- API compatibility
# Fields the app relies on. A Vikunja update that renames or drops one breaks the app:
# this is caught here (and by update-vikunja.ps1 before switching versions).
REQUIRED = {
    'task': ['id', 'title', 'description', 'done', 'due_date', 'start_date', 'project_id', 'labels', 'priority',
             'repeat_after', 'repeat_mode', 'related_tasks', 'created', 'updated'],
    'project': ['id', 'title', 'description', 'parent_project_id', 'is_archived', 'position'],
    'label': ['id', 'title', 'hex_color'],
}


def check_contract(token):
    if not token:
        add('API compatibility', 'warn', 'no read-only API token configured, only the public endpoint is tested',
            'Create a read-only token in Vikunja (Settings > API Tokens) and paste it into state\\api-token.txt (see docs\\OPERATIONS.md).')
        return
    problems = []
    try:
        _, h, body = http_get(f'{BASE}/api/v1/tasks?page=1&per_page=5', token)
        tasks = json.loads(body)
        if 'X-Pagination-Total-Pages' not in h and 'x-pagination-total-pages' not in {k.lower() for k in h}:
            problems.append('tasks: pagination header missing')
        if tasks:
            miss = [f for f in REQUIRED['task'] if f not in tasks[0]]
            if miss:
                problems.append('task fields missing: ' + ', '.join(miss))
        _, _, body = http_get(f'{BASE}/api/v1/projects?is_archived=true&page=1&per_page=50', token)
        projects = json.loads(body)
        real = [p for p in projects if p.get('id', 0) > 0]
        if real:
            miss = [f for f in REQUIRED['project'] if f not in real[0]]
            if miss:
                problems.append('project fields missing: ' + ', '.join(miss))
        pseudo = [p for p in projects if p.get('id', 0) < 0]
        if pseudo:
            fid = -pseudo[0]['id'] - 1
            _, _, body = http_get(f'{BASE}/api/v1/filters/{fid}', token)
            f = json.loads(body)
            if 'filter' not in (f.get('filters') or {}):
                problems.append('saved filter has no "filters.filter"')
        _, _, body = http_get(f'{BASE}/api/v1/labels?page=1&per_page=50', token)
        labels = json.loads(body)
        if labels:
            miss = [f for f in REQUIRED['label'] if f not in labels[0]]
            if miss:
                problems.append('label fields missing: ' + ', '.join(miss))
    except urllib.error.HTTPError as e:
        if e.code == 401:
            add('API compatibility', 'warn', 'the token in state/api-token.txt is refused (expired or deleted)',
                'Create a new read-only token in Vikunja and paste it into state\\api-token.txt.')
            return
        problems.append(f'HTTP {e.code} on {e.url}')
    except Exception as e:  # noqa: BLE001
        problems.append(str(e))
    if problems:
        add('API compatibility', 'fail', '; '.join(problems),
            'Run scripts\\rollback-vikunja.bat, then send Claude the Error report so the app can be adapted.')
    else:
        add('API compatibility', 'ok', 'tasks, projects, saved filters and labels have every field the app uses')


# ---------------------------------------------------------------- app server
def check_app():
    try:
        st, _, body = http_get('http://127.0.0.1:5173/project/1')
        ok = b'manifest.webmanifest' in body
        add('App server', 'ok' if ok else 'fail', 'serving the app' if ok else 'answers, but the page looks wrong',
            '' if ok else 'Run scripts\\rollback-app.bat (it puts the previous version back).')
    except Exception as e:  # noqa: BLE001
        add('App server', 'fail', f'not answering on port 5173 ({e})', 'Run scripts\\restart-server.bat. If it still fails, see ' + DOCS + '.')


# ---------------------------------------------------------------- Tailscale / Funnel
def check_tailscale():
    if not WIN or not os.path.exists(TS):
        add('Tailscale', 'fail' if WIN else 'ok', 'not installed' if WIN else 'skipped (not Windows)',
            'Reinstall Tailscale and sign in with your account (docs\\MOVE-TO-NEW-PC.md, step 3).' if WIN else '')
        return None
    code, out, err = run([TS, 'status', '--json'])
    if code != 0 or not out.strip().startswith('{'):
        time.sleep(30)  # starting up: try once more before calling it a problem
        code, out, err = run([TS, 'status', '--json'])
    dns = None
    try:
        st = json.loads(out)
        state = st.get('BackendState')
        dns = (st.get('Self') or {}).get('DNSName', '').rstrip('.')
        if state == 'Running':
            add('Tailscale', 'ok', f'connected as {dns}')
        else:
            add('Tailscale', 'fail', f'state {state}', 'Open Tailscale on the PC and connect (sign in again if asked), then run scripts\\health-check-now.bat.')
    except Exception:  # noqa: BLE001
        add('Tailscale', 'fail', (err or out)[:200], 'Open Tailscale on the PC and connect (sign in again if asked).')
    code, out, err = run([TS, 'funnel', 'status'])
    text = out + err
    need = {'443 (Vikunja)': ('3456', dns or ''), '8443 (app)': (':8443', '5173')}
    missing = [k for k, (a, b) in need.items() if a not in text or (b and b not in text)]
    if 'Funnel on' in text and not missing:
        add('Public addresses (Funnel)', 'ok', 'Vikunja on 443, app on 8443')
    else:
        add('Public addresses (Funnel)', 'fail', 'missing: ' + (', '.join(missing) or 'Funnel is off'),
            'Run scripts\\restart-server.bat (it switches Funnel back on). If Tailscale says Funnel is not allowed, open the link it prints.')
    return dns


def cert_expiry(host, port):
    """Expiry date of the certificate the address really serves (read without trusting the
    PC's own certificate store, which can be out of date and wrongly call it expired)."""
    import socket, ssl, tempfile
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with socket.create_connection((host, port), timeout=15) as sock:
        with ctx.wrap_socket(sock, server_hostname=host) as s:
            der = s.getpeercert(binary_form=True)
    pem = ssl.DER_cert_to_PEM_cert(der)
    with tempfile.NamedTemporaryFile('w', suffix='.pem', delete=False) as f:
        f.write(pem)
        path = f.name
    try:
        info = ssl._ssl._test_decode_cert(path)  # noqa: SLF001 (CPython helper, stdlib only)
    finally:
        os.unlink(path)
    return dt.datetime.strptime(info['notAfter'], '%b %d %H:%M:%S %Y %Z'), info


def check_public(dns):
    if not dns:
        return
    for name, url, port in (('Public Vikunja address', f'https://{dns}/api/v1/info', 443), ('Public app address', f'https://{dns}:8443/', 8443)):
        try:
            http_get(url, timeout=15)
            add(name, 'ok', url)
            continue
        except Exception as e:  # noqa: BLE001
            err = e
        # The PC's own trust store may reject a certificate that phones and browsers accept.
        try:
            until, info = cert_expiry(dns, port)
            days = (until - dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)).days
            subj = dict(x[0] for x in info.get('subject', ()))
            if subj.get('commonName', '') != dns and dns not in str(info.get('subjectAltName', '')):
                add(name, 'fail', f'{url} serves a certificate for another name', 'Run scripts\\restart-server.bat. If it still fails, see ' + DOCS + '.')
            elif days < 0:
                add(name, 'fail', f'certificate expired on {until:%d %b %Y}', 'Restart Tailscale (tray icon > Exit, then start it), then run scripts\\restart-server.bat.')
            elif days < 10:
                add(name, 'warn', f'certificate expires in {days} days ({until:%d %b %Y}) and was not renewed yet', 'Nothing yet: Tailscale renews it by itself. If this stays for days, restart Tailscale.')
            else:
                add(name, 'ok', f'{url} answers; certificate valid until {until:%d %b %Y} (this PC\'s own certificate store is out of date, devices are not affected)')
        except Exception as e2:  # noqa: BLE001
            add(name, 'warn', f'{url} not reachable from the PC itself ({err}; {e2})',
                'Check from the phone with mobile data. If it fails there too, run scripts\\restart-server.bat.')


# ---------------------------------------------------------------- Windows tasks
def is_admin():
    try:
        import ctypes
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:  # noqa: BLE001
        return False


def check_tasks():
    if not WIN:
        return
    if not is_admin():
        # Without admin rights Windows hides tasks that run as SYSTEM: they would look "missing".
        add('Windows tasks', 'ok', 'not checked in this run (needs admin rights; the hourly check and health-check-now.bat do it)')
        return
    names = ['Vikunja', 'Tasks app', 'Vikunja backup', 'Tasks health check'] + (['Tasks automations'] if AUTO_ENABLED.exists() else [])
    ps = ("$n=" + ','.join(f"'{n}'" for n in names) + ";"
          "Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue | ForEach-Object {"
          "$i = $_ | Get-ScheduledTaskInfo; [pscustomobject]@{n=$_.TaskName;s=[string]$_.State;r=$i.LastTaskResult;t=$i.LastRunTime} } | ConvertTo-Json -Compress")
    code, out, err = run(['powershell', '-NoProfile', '-Command', ps], timeout=40)
    try:
        items = json.loads(out) if out.strip() else []
        items = items if isinstance(items, list) else [items]
    except Exception:  # noqa: BLE001
        items = []
    found = {i['n']: i for i in items}
    for name, must_run in [('Vikunja', True), ('Tasks app', True), ('Vikunja backup', False), ('Tasks health check', False)] + \
            ([('Tasks automations', True)] if AUTO_ENABLED.exists() else []):
        i = found.get(name)
        if not i:
            add(f'Windows task "{name}"', 'fail', 'missing', 'Run scripts\\repair-services.bat (it re-creates every scheduled task).')
        elif i['s'] == 'Disabled':
            add(f'Windows task "{name}"', 'fail', 'disabled', 'Run scripts\\repair-services.bat (it re-creates every scheduled task).')
        elif must_run and i['s'] != 'Running':
            add(f'Windows task "{name}"', 'fail', f"state {i['s']}", 'Run scripts\\restart-server.bat.')
        else:
            add(f'Windows task "{name}"', 'ok', i['s'])


# ---------------------------------------------------------------- backups / disk
def check_backups():
    b = ROOT / 'backups'
    files = sorted(b.glob('vikunja-*.db'), key=lambda f: f.stat().st_mtime) if b.exists() else []
    if not files:
        add('Backups', 'fail', 'no backup found', 'Run scripts\\backup-now.bat, then scripts\\repair-services.bat if the daily backup task is missing.')
        return
    age_h = (time.time() - files[-1].stat().st_mtime) / 3600
    last = read_text(b / 'backup.log').splitlines()[-1:] or ['']
    bad = 'integrity=ok' not in last[0]
    if age_h > 30:
        add('Backups', 'fail', f'last backup {age_h:.0f} h old ({files[-1].name})', 'Run scripts\\backup-now.bat, then scripts\\repair-services.bat if the daily backup task is missing.')
    elif bad:
        add('Backups', 'fail', f'last backup failed its check: {last[0]}', 'Run scripts\\backup-now.bat. If it fails again, see ' + DOCS + '.')
    else:
        add('Backups', 'ok', f'{len(files)} kept, last {age_h:.0f} h ago')


def _when(line):
    try:
        return dt.datetime.fromisoformat(line.split('|')[0].strip()[:19])
    except ValueError:
        return None


def check_device_versions():
    """Each device tells the PC which version of the app it runs (tools/serve_app.py keeps the last
    one in state/devices.json). A device that keeps running an old version long after a new one went
    live is stuck (22 Oct 2026: the PC app ran the 10 Oct version for days and nothing said so)."""
    devs = {}
    try:
        devs = json.loads(read_text(STATE / 'devices.json') or '{}')
    except ValueError:
        pass
    vfile = ROOT / 'app' / 'version.txt'
    live = read_text(vfile).strip()[:16].replace('T', ' ')
    if not live or not devs:
        add('App versions', 'ok', 'no device has reported its version yet' if live else 'no app version found')
        return
    try:
        live_since = dt.datetime.fromtimestamp(os.path.getctime(vfile) if WIN else os.path.getmtime(vfile)).astimezone()
    except OSError:
        live_since = dt.datetime.now().astimezone()
    now = dt.datetime.now().astimezone()
    stuck, upto = {}, []
    for name, d in sorted(devs.items()):
        try:
            seen = dt.datetime.fromisoformat(d.get('seen', ''))
        except ValueError:
            continue
        if seen.tzinfo is None:
            seen = seen.astimezone()
        if now - seen > dt.timedelta(days=3):
            continue  # not used lately: it updates when it is next opened
        account = d.get('account')  # 30 Oct 2026; older entries have none
        if (d.get('build') or '') == live:
            upto.append(name)
        elif seen - live_since > dt.timedelta(hours=2):
            stuck.setdefault(account, []).append(f"{name} ({d.get('build') or '?'})")
    fix = 'On that device, reload the app (Ctrl+Shift+R or Cmd+R). If it stays old, uninstall the app there and install it again from the same address.'
    for account, items in stuck.items():
        add(per_account_name('App versions', account), 'warn', f"still on an old version: {'; '.join(items)[:220]} (live: {live})", fix,
            account=account, cause=[i.rsplit(' (', 1)[0] for i in items], admin_only=account is None)
    if not stuck:
        add('App versions', 'ok', f"up to date ({len(upto)} device(s) used in the last 3 days)" if upto else 'up to date (no recent device)')


def check_auto_update():
    """Updates applied without you at the PC (scripts/auto-update.ps1, task "Tasks auto-update")."""
    last = read_text(STATE / 'auto-update-last.txt').strip().lstrip('\ufeff')
    if not last:
        add('Auto-update', 'ok', 'nothing applied automatically yet')
        return
    parts = (last.split('|') + ['', '', '', '', ''])[:5]
    when, res, what, detail, log = parts
    try:
        age = dt.datetime.now() - dt.datetime.fromisoformat(when)
    except ValueError:
        age = dt.timedelta(0)
    if res == 'fail' and age < dt.timedelta(days=3):
        add('Auto-update', 'warn', f'{what} failed ({when.replace("T", " ")[:16]}): {detail[:200]}',
            'Ask Claude to look at it (it can read ' + (pathlib.Path(log).name if log else 'state\\auto-update-history.log') + '). Nothing to undo: a failed app update puts the previous version back by itself.')
    else:
        add('Auto-update', 'ok', f'last: {what} {"ok" if res == "ok" else "failed"} ({when.replace("T", " ")[:16]}){": " + detail[:120] if detail else ""}')


def check_device_errors():
    """Faults the devices sent to the PC (tools/serve_app.py, POST /client-log): sync failures,
    changes the server refused, crashes of the page. Messages that only tell you something
    (such as "choose a project first") are not faults and are not counted here."""
    path = STATE / 'client-log.jsonl'
    if not path.exists():
        add('Device errors (24 h)', 'ok', 'none reported')
        return
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M:%S')
    faults = []
    for line in read_text(path).splitlines():
        try:
            e = json.loads(line)
        except ValueError:
            continue
        # "offline" only (the device lost its network during a sync) is not a fault (25 Oct 2026).
        # Also "Failed to fetch" / "NetworkError" / "Load failed": the network dropped while an
        # answer was arriving (6 Nov 2026, the Mac going to sleep).
        only_offline = re.fullmatch(r"Partially synced .*?: ((offline|Failed to fetch|NetworkError[^;]*|Load failed)(; )?)+", str(e.get('message', ''))) is not None
        # A harmless browser notice reported by older app versions (25 Oct 2026).
        only_offline = only_offline or 'ResizeObserver loop' in str(e.get('message', ''))
        if e.get('kind') in ('sync', 'refused', 'crash') and not only_offline and str(e.get('last') or e.get('at') or '')[:19] >= since:
            faults.append(e)
    if not faults:
        add('Device errors (24 h)', 'ok', 'none reported')
        return
    fix = 'Nothing if it is a one-off. If it repeats, send Claude the Error report (Help > Error report).'
    by_account = {}
    for e in faults:
        by_account.setdefault(e.get('account'), []).append(e)  # 30 Oct 2026: whose device
    for account, items in by_account.items():
        n = sum(int(e.get('count') or 1) for e in items)
        last = items[-1]
        devices = sorted({str(e.get('device') or '?') for e in items})
        who = (lambda d: f'{account} · {d}') if account else (lambda d: d)
        add(per_account_name('Device errors (24 h)', account), 'warn',
            f"{n} on {len(devices)} device(s); last: {last.get('message', '')[:160]} ({who(last.get('device', '?'))})", fix,
            account=account, cause=[who(d) for d in devices], admin_only=account is None)


def check_offsite():
    """Copies to the Mac through Tailscale (scripts/weekly-safeguard.ps1, every hour). Only one
    alarm (21 Oct 2026): nothing has reached the Mac for 10 days. A Mac asleep for a while, or a
    failed attempt, is normal and retried every hour."""
    if not (STATE / 'offsite-target.txt').exists():
        add('Off-PC copy', 'warn', 'not set up: if this PC dies, the backups die with it',
            'Run scripts\\install-weekly-safeguard.bat once.')
        return
    sent = read_text(STATE / 'offsite-sent.txt').strip()
    when = _when(sent) if sent else None
    mac = sent.split('|')[1] if sent.count('|') >= 2 else 'the Mac'
    if not when:  # nothing sent yet: counted from the day the copies were set up
        when = dt.datetime.fromtimestamp((STATE / 'offsite-target.txt').stat().st_mtime)
    age_d = (dt.datetime.now() - when).total_seconds() / 86400
    if age_d > 10:
        last = read_text(STATE / 'offsite-last.txt').strip().split('|')
        add('Off-PC copy', 'warn', f'no copy has reached {mac} for {age_d:.0f} days' + (f' (last attempt: {last[2]})' if len(last) >= 3 else ''),
            'Wake the Mac with Tailscale on: waiting copies are sent within the hour. If it is awake, run scripts\\weekly-safeguard.bat and read its log.')
    elif sent:
        add('Off-PC copy', 'ok', f'last copy reached {mac} {age_d:.0f} days ago ({sent.split("|")[-1]})')
    else:
        add('Off-PC copy', 'ok', 'set up; nothing has reached the Mac yet (it is retried every hour)')


def check_disk():
    free = shutil.disk_usage(ROOT).free / 1e9
    add('Disk space', 'ok' if free > 10 else 'warn' if free > 3 else 'fail', f'{free:.0f} GB free',
        '' if free > 10 else 'Free some space on C: (Disk Cleanup, empty the Recycle Bin).')


# ---------------------------------------------------------------- database
def check_db():
    if not DB.exists():
        add('Database', 'fail', f'{DB} missing', 'Run scripts\\restore-backup.bat and choose the newest backup.')
        return
    try:
        c = sqlite3.connect(f'file:{DB}?mode=ro', uri=True, timeout=10)
        qc = c.execute('pragma quick_check').fetchone()[0]
        live = 'deleted_at is null'
        n_tasks = c.execute(f'select count(*) from tasks where {live}').fetchone()[0]
        n_proj = c.execute('select count(*) from projects').fetchone()[0]
        orphans = {
            'tasks in a deleted project': f'select count(*) from tasks where {live} and project_id not in (select id from projects)',
            'sub-projects of a missing project': 'select count(*) from projects where parent_project_id > 0 and parent_project_id not in (select id from projects)',
            'relations to a missing task': 'select count(*) from task_relations where task_id not in (select id from tasks) or other_task_id not in (select id from tasks)',
            'labels on a missing task': 'select count(*) from label_tasks where task_id not in (select id from tasks) or label_id not in (select id from labels)',
        }
        found = {k: c.execute(q).fetchone()[0] for k, q in orphans.items()}
        size = DB.stat().st_size / 1e6
        c.close()
        if qc != 'ok':
            add('Database', 'fail', f'integrity check: {qc}', 'Stop using the app, run scripts\\restore-backup.bat and choose the newest backup (see ' + DOCS + ').')
        else:
            add('Database', 'ok', f'{n_tasks} tasks, {n_proj} projects, {size:.1f} MB')
        # Label links left behind by deleted tasks are harmless leftovers Vikunja never
        # cleans: reported for information only, so the overall status is not stuck on warn.
        harmless = {'labels on a missing task'}
        bad = {k: v for k, v in found.items() if v and k not in harmless}
        info = {k: v for k, v in found.items() if v and k in harmless}
        detail = ', '.join(f'{v} {k}' for k, v in bad.items()) or 'no orphans'
        if info:
            detail += ' (' + ', '.join(f'{v} {k}, harmless' for k, v in info.items()) + ')'
        add('Data consistency', 'warn' if bad else 'ok', detail,
            'Not urgent: send Claude the Error report; nothing is lost.' if bad else '')
    except Exception as e:  # noqa: BLE001
        add('Database', 'warn', f'could not read it ({e})', 'Nothing yet: it is checked again in an hour. If it stays, see ' + DOCS + '.')


# ---------------------------------------------------------------- GTD automations
def _token_owner(token):
    try:
        c = sqlite3.connect(f'file:{DB}?mode=ro', uri=True, timeout=10)
        import hashlib
        # Newer tokens are stored by their SHA-256, older ones (before Vikunja 2.x) by their last 8 characters.
        rows = c.execute('select owner_id from api_tokens where token_sha256 = ? or token_last_eight = ?',
                         (hashlib.sha256(token.encode()).hexdigest(), token[-8:])).fetchall()
        c.close()
        owners = {r[0] for r in rows}
        return owners.pop() if len(owners) == 1 else None
    except Exception:  # noqa: BLE001
        return None


def automation_accounts():
    """[(name, memory folder, user id)]: your account, then every account that switched the
    automations on in the app (26 Oct 2026)."""
    out = [('you', AUTO_STATE, _token_owner(read_text(STATE / 'automation-token.txt').strip()))]
    users = AUTO_STATE / 'users'
    if users.is_dir():
        for d in sorted(users.iterdir()):
            tok = read_text(d / 'api_token.txt').strip()
            if tok:
                out.append((d.name, d, _token_owner(tok)))
    return out


def _beat_age(folder):
    beat = read_text(folder / 'heartbeat.txt').strip()
    try:
        return (dt.datetime.now(dt.timezone.utc) - dt.datetime.strptime(beat, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=dt.timezone.utc)).total_seconds()
    except ValueError:
        return None


def check_automations():
    """The label / project / date automations (automations/, moved from the Mac on 10 Oct 2026),
    for your account and, since 26 Oct 2026, every account that switched them on.
    Nothing is reported until they are switched on with scripts/start-automations.bat."""
    if not (AUTO / 'webhook_listener.py').exists() or not AUTO_ENABLED.exists():
        return
    fix_stopped = 'Run scripts\\restart-server.bat (it restarts the automations too). If it comes back, send Claude the Error report.'
    accounts = automation_accounts()
    others = len(accounts) - 1
    ages = {name: _beat_age(folder) for name, folder, _ in accounts}
    never = [n for n, a in ages.items() if a is None]
    stopped = [f'{n} ({a / 60:.0f} min)' for n, a in ages.items() if a is not None and a > 5 * 60]
    # An account just switched on gets a few minutes before its first cycle counts as missing.
    never = [n for n in never if n == 'you' or (AUTO_STATE / 'users' / n / 'api_token.txt').stat().st_mtime < time.time() - 600]
    for_whom = f' for you and {others} other account{"s" if others > 1 else ""}' if others else ''
    me = main_username()
    acct = lambda n: me if n == 'you' else n  # noqa: E731
    if 'you' in never:
        add('Automations', 'fail', 'they have not run yet', fix_stopped)
    elif 'you' in [s_.split(' (')[0] for s_ in stopped]:
        add('Automations', 'fail', 'stopped: ' + next(s_ for s_ in stopped if s_.startswith('you ')), fix_stopped)
    else:
        add('Automations', 'ok', f'running{for_whom} (labels, dates, pending projects; last cycle {(ages["you"] or 0):.0f} s ago)')
    # Another account's poller stopped: concerns that account (30 Oct 2026).
    for item in stopped + [f'{n} (never ran)' for n in never if n != 'you']:
        n = item.split(' (')[0]
        if n == 'you':
            continue
        add(per_account_name('Automations', n), 'fail', 'stopped for this account: ' + item.split(' (', 1)[1].rstrip(')'), fix_stopped, account=n)
    alive = {n: a is not None and a <= 5 * 60 for n, a in ages.items()}
    # Problems they reported in the last 12 hours
    cutoff = dt.datetime.now() - dt.timedelta(hours=12)
    any_errors = False
    for name, folder, _ in accounts:
        recent = []
        for line in read_text(folder / 'errors.log').splitlines():
            stamp, _, rest = line.partition(' ')
            try:
                if dt.datetime.fromisoformat(stamp) >= cutoff:
                    recent.append(rest.strip())
            except ValueError:
                continue
        if recent:
            any_errors = True
            add(per_account_name('Automation errors (12 h)', acct(name)) if name != 'you' else 'Automation errors (12 h)', 'warn',
                f'{len(recent)}: ' + ' | '.join(recent[-3:])[:300],
                'Nothing if it is a one-off (server restarting). If it repeats, send Claude the Error report.', account=acct(name))
    if not any_errors:
        add('Automation errors (12 h)', 'ok', 'none')
    # Their own data checks, on a read-only copy of the database, each account on its own
    try:
        sys.path.insert(0, str(AUTO))
        import healthcheck as auto_hc  # automations/healthcheck.py (this file is tools/healthcheck.py)
        skip = {'check_project_folders', 'check_review_backlog', 'check_possible_copies', 'check_missing_start'}
        # Fixed by the automations within a minute: only a problem when they are stopped.
        self_healing = {'due-date labels', 'completed tasks'}
        bad, n_checks = [], 0
        for name, folder, owner in accounts:
            if owner is None and name != 'you':
                continue
            snap = auto_hc.split_bin(auto_hc.load_sqlite(str(DB), owner=owner))
            for fn in auto_hc.DATA_CHECKS:
                if fn.__name__ in skip:
                    continue
                try:
                    r = fn(snap)
                except Exception as e:  # noqa: BLE001 - one broken check must not hide the others
                    r = auto_hc.Result(fn.__name__[6:].replace('_', ' '), 'warn', f'the check itself failed: {e}')
                n_checks += 1
                if r.level in ('warn', 'fail') and not (alive.get(name) and r.name in self_healing):
                    bad.append((name, r))
        if not bad:
            add('Automation data checks', 'ok', f'{n_checks} checks{for_whom}: labels, relations, projects, saved filters')
        else:
            # One line per account: its data is its own (30 Oct 2026).
            for n in dict.fromkeys(n for n, _ in bad):
                mine = [r for m, r in bad if m == n]
                level = 'fail' if any(r.level == 'fail' for r in mine) else 'warn'
                add('Automation data checks' if n == 'you' else per_account_name('Automation data checks', n), level,
                    # Every item, so each task concerned can be found (23 Nov 2026): the app links
                    # "task #N" to the task.
                    '; '.join(f'{r.name}: {r.summary}' + (f' ({", ".join(r.items)})' if r.items else '') for r in mine)[:600],
                    'Not urgent unless it says "fail": send Claude the Error report; nothing is lost.', account=acct(n))
    except Exception as e:  # noqa: BLE001
        add('Automation data checks', 'warn', f'could not run ({e})', 'Send Claude the Error report.')
    finally:
        if str(AUTO) in sys.path:
            sys.path.remove(str(AUTO))


# ---------------------------------------------------------------- logs, power, versions
def check_log():
    log = VK / 'vikunja.log'
    if not log.exists():
        return
    size = log.stat().st_size / 1e6
    try:
        with open(log, 'rb') as f:
            f.seek(max(0, log.stat().st_size - 400_000))
            tail = f.read().decode('utf-8', 'replace').splitlines()
    except OSError:
        tail = []
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=1)).strftime('%Y-%m-%dT%H:%M')
    errs = [l for l in tail if 'level=ERROR' in l and l[5:21] >= since]
    if errs:
        add('Server errors (last hour)', 'warn', f'{len(errs)}: ' + errs[-1][:240], 'Nothing if it is a one-off. If it repeats, send Claude the Error report (' + DOCS + ', "Errors in vikunja.log").')
    else:
        add('Server errors (last hour)', 'ok', 'none')
    if size > 100:
        add('Server log size', 'warn', f'{size:.0f} MB', 'Run scripts\\restart-server.bat: it starts a fresh log (the old one is kept as vikunja.log.old).')


def check_mains():
    """A laptop server must stay on its charger: on battery it ends up asleep or off, and no
    device can sync (Oct 2026). Checked every hour, so the alert reaches the phone in time."""
    if not WIN:
        return
    # 11 Nov 2026: "on the charger" is read from Windows' own power line flag (PowerOnline). The
    # battery's "discharging" status alone gave five false alarms in one night: plugged in and full
    # (97-98 %), the battery rests and says "discharging". Kept as a fallback only.
    code, out, _ = run(['powershell', '-NoProfile', '-Command', POWER_PS], timeout=30)
    parts = out.split()
    if code != 0 or len(parts) < 2:
        return  # a desktop PC, or unknown
    online, charge = parts[0], parts[1]
    since_file = STATE / 'on-battery-since.txt'
    start_file = STATE / 'on-battery-charge.txt'
    if online == '1':
        since_file.unlink(missing_ok=True)
        start_file.unlink(missing_ok=True)
        add('Power', 'ok', f'on the charger (battery {charge}%)')
        return
    # On battery (10 Nov 2026): a problem (red, urgent on the phone) after one hour in a row, or at
    # 20 % or less. 9-10 Nov: the 4-hour warning came at 00:07 and the battery ran out at 05:07.
    # The start is remembered across checks, restarts and sleeps; scripts\auto-update.ps1 watches
    # it every minute and starts this check as soon as a limit is reached.
    try:
        since = dt.datetime.fromisoformat(since_file.read_text().strip())
    except (OSError, ValueError):
        since = dt.datetime.now()
        since_file.write_text(since.isoformat(timespec='seconds'))
        start_file.write_text(charge)
    hours = (dt.datetime.now() - since).total_seconds() / 3600
    try:
        low = int(charge) <= POWER_LOW_PERCENT
        # Really running on the battery: its charge has gone down since the start.
        dropping = int(start_file.read_text().strip()) - int(charge) >= POWER_MIN_DROP
    except (OSError, ValueError):
        low = False
        dropping = True
    left = f'{hours * 60:.0f} min' if hours < 1 else f'{hours:.1f} h'
    if (hours >= POWER_FAIL_HOURS and dropping) or low:
        add('Power', 'fail', f'on battery for {left} ({charge}% left): it will switch off, and then no device can sync',
            'Plug the charger in now (check the socket and the cable). Nothing else to do.')
    else:
        add('Power', 'ok', f'on battery for {left} ({charge}% left); a problem after 1 h 30 or at {POWER_LOW_PERCENT} %')


POWER_FAIL_HOURS = 1.5   # 11 Nov 2026 (was 1)
POWER_LOW_PERCENT = 20
POWER_MIN_DROP = 3       # percentage points lost since unplugged, to count as really on battery
# Prints "<1 on the charger / 0 on battery> <charge %>"; nothing on a PC without a battery.
POWER_PS = (
    '$b = Get-CimInstance Win32_Battery | Select-Object -First 1; if ($b) { $on = $null; '
    'try { $s = Get-CimInstance -Namespace root\\wmi -ClassName BatteryStatus -ErrorAction Stop | Select-Object -First 1; '
    'if ($s) { $on = [bool]$s.PowerOnline } } catch { }; '
    'if ($null -eq $on) { $on = ($b.BatteryStatus -ne 1) }; "$([int]$on) $($b.EstimatedChargeRemaining)" }'
)


def check_downtime():
    """Hours with no health check mean the PC was asleep or off, so no device could sync.
    Reported for a day after the PC is back (Oct 2026: asleep 3.5 days, nobody knew)."""
    stamps = []
    for line in read_text(LOGS / 'health.log').splitlines():
        try:
            stamps.append(dt.datetime.fromisoformat(line.split(' ', 1)[0]))
        except ValueError:
            continue
    now = dt.datetime.now().astimezone()
    stamps = [t for t in stamps if now - t < dt.timedelta(days=8)] + [now]
    gaps = [(a, b) for a, b in zip(stamps, stamps[1:]) if b - a > dt.timedelta(hours=2, minutes=30)]
    recent = [(a, b) for a, b in gaps if now - b < dt.timedelta(hours=24)]
    if recent:
        a, b = recent[-1]
        hours = (b - a).total_seconds() / 3600
        add('Interruptions', 'warn', f'the PC was asleep or off from {a:%a %d %b %H:%M} to {b:%a %d %b %H:%M} ({hours:.0f} h): no device could sync then',
            'Nothing if you know why. Otherwise run scripts\\diagnose-power.bat and give its result to Claude.')
    elif gaps:
        a, b = gaps[-1]
        add('Interruptions', 'ok', f'none in the last 24 h (last one: {a:%d %b %H:%M} to {b:%d %b %H:%M})')
    else:
        add('Interruptions', 'ok', 'the PC has been on all week')


# ---------------------------------------------------------------- what runs on the PC (12 Nov 2026)
STARTUP_NEEDED = re.compile(
    r'SecurityHealth|Windows|Defender|Tailscale|Claude|OneDrive|Realtek|Rtk|NVIDIA|Intel|igfx|AMD|Radeon|Synaptics|ELAN|Bluetooth|Audio',
    re.I)
HEAVY_RUNS = 3   # a program counts as heavy when it is heavy at 3 hourly checks in a row


def check_pc_load():
    """Lou, 12 Nov 2026 (the fan was loud): nothing useless should open or stay open, for the
    to-do or its upkeep, while Windows works normally (updates, antivirus, search...). Three parts:
    the server's own scripts (stuck or twice: stopped, and said here), programs that keep the
    processor or the memory busy for hours, and the programs that start with Windows."""
    if not WIN:
        return
    # Stopping is switched on by state/pc-load-stop.txt (first checked on the real PC without it).
    stop = ['-StopStuck'] if (STATE / 'pc-load-stop.txt').exists() else []
    code, out, _ = run(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(HERE / 'pc-load.ps1')] + stop, timeout=90)
    try:
        r = json.loads(out.strip().splitlines()[-1])
    except (ValueError, IndexError):
        return
    lst = lambda v: v if isinstance(v, list) else ([v] if v else [])  # noqa: E731  (PowerShell: one item is not a list)
    # 1. The server's own.
    stopped = lst(r.get('stopped'))
    log = STATE / 'pc-load-stopped.log'
    if stopped:
        with open(log, 'a', encoding='utf-8') as f:
            f.write(f"{dt.datetime.now().isoformat(timespec='seconds')} stopped: {'; '.join(stopped)}\n")
    dups = [d for d in lst(r.get('duplicates')) if not d.startswith(('Vikunja', 'app server'))]
    left = [d for d in lst(r.get('duplicates')) if d.startswith(('Vikunja', 'app server'))]
    detail = f"{len(lst(r.get('ours')))} programs, {r.get('ours_mb', 0)} MB"
    if stopped:
        detail += '; stopped just now: ' + ', '.join(stopped)
    elif not stop and (lst(r.get('stuck')) or dups):
        detail += '; would stop: ' + ', '.join(lst(r.get('stuck')) + dups)
    if left:
        add('PC: the server\'s programs', 'warn', detail + '; running twice: ' + ', '.join(left),
            'Run scripts\\restart-server.bat (it starts each one once).', admin_only=True)
    else:
        add('PC: the server\'s programs', 'ok', detail + ('' if stopped or lst(r.get('stuck')) or dups else '; nothing stuck, nothing twice'), admin_only=True)
    # 2. Programs that keep the PC busy, for hours (one busy moment is normal).
    hist_file = STATE / 'pc-load.json'
    try:
        hist = json.loads(hist_file.read_text())
    except (OSError, ValueError):
        hist = {}
    heavy = {h['name']: h for h in lst(r.get('heavy'))}
    hist = {n: hist.get(n, 0) + 1 for n in heavy}
    hist_file.write_text(json.dumps(hist))
    lasting = [heavy[n] for n, k in hist.items() if k >= HEAVY_RUNS]
    mem = r.get('memory_used', 0)
    if lasting:
        what = ', '.join(f"{h['name']} ({h['cpu']} % processor, {h['mb'] / 1024:.1f} GB)" for h in lasting)
        add('PC: busy programs', 'warn', f'busy for 3 hours or more: {what}; memory {mem} % used',
            'Close it if you do not need it (Claude on the PC is only needed while Claude works on the PC). '
            'If the fan stays loud, restart the PC: the server starts again by itself.', admin_only=True)
    else:
        add('PC: busy programs', 'ok', f'none for hours; memory {mem} % used' + (
            f"; busy right now: {', '.join(heavy)}" if heavy else ''), admin_only=True)
    # 3. Programs that start with Windows.
    extra = [x for x in lst(r.get('startup')) if not STARTUP_NEEDED.search(x)]
    if extra:
        add('PC: start-up programs', 'warn', 'start with Windows and are not needed by the server or by Windows: ' + ', '.join(extra),
            'Task Manager (Ctrl+Shift+Esc) > Startup apps: disable those you do not use. '
            'If you want to keep them, click "Got it".', admin_only=True)
    else:
        add('PC: start-up programs', 'ok', 'only what Windows, the drivers and the server need', admin_only=True)


def check_power():
    if not WIN:
        return
    code, out, _ = run(['powercfg', '/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE'])
    lines = [l for l in out.splitlines() if '0x' in l]
    ac = lines[-2].split()[-1] if len(lines) >= 2 else ''
    if ac and int(ac, 16) == 0:
        add('Sleep', 'ok', 'the PC never sleeps on mains power')
    else:
        add('Sleep', 'warn', f'the PC may go to sleep (value {ac or "?"})', 'Run scripts\\repair-services.bat (it sets the PC never to sleep on mains power).')


def latest_release():
    cache = STATE / 'latest-release.json'
    try:
        if cache.exists() and time.time() - cache.stat().st_mtime < 12 * 3600:
            return json.loads(cache.read_text())
        _, _, body = http_get('https://api.github.com/repos/go-vikunja/vikunja/releases/latest', timeout=15)
        r = json.loads(body)
        data = {'tag': r.get('tag_name'), 'url': r.get('html_url'), 'published': r.get('published_at'),
                'security': any(w in (r.get('body') or '').lower() for w in ('security', 'cve-', 'vulnerab'))}
        cache.write_text(json.dumps(data))
        return data
    except Exception:  # noqa: BLE001
        return None


def check_versions(info):
    if not info:
        return
    cur = (info.get('version') or '').lstrip('v')
    rel = latest_release()
    if not rel or not rel.get('tag'):
        add('Vikunja version', 'ok', f'{cur} (could not check for updates)')
        return
    latest = rel['tag'].lstrip('v')

    def key(v):
        return tuple(int(x) for x in v.split('-')[0].split('.') if x.isdigit())
    if key(cur) >= key(latest):
        add('Vikunja version', 'ok', f'{cur}, up to date')
    else:
        add('Vikunja version', 'fail' if rel.get('security') else 'warn',
            f"{cur} installed, {latest} available{' (mentions security fixes)' if rel.get('security') else ''}",
            'Run scripts\\update-vikunja.bat: it tests the new version on a copy of your data first and goes back by itself if anything fails.')
    if WIN and os.path.exists(TS):
        code, out, _ = run([TS, 'version'])
        add('Tailscale version', 'ok', out.splitlines()[0] if out else '?')


def overall(checks):
    return acks.overall(checks)


# ---------------------------------------------------------------- output
def write_outputs():
    order = {'fail': 2, 'warn': 1, 'ok': 0}
    # "Got it" for one person (30 Oct 2026): forget those whose warning has changed or gone.
    per = acks.load(acks.USER_ACKS)
    if per:
        kept = {u: k for u, k in ((u, acks.still_in_force(checks, a)) for u, a in per.items()) if k}
        if kept != per:
            try:
                acks.save(acks.USER_ACKS, kept)
            except OSError:
                pass
        per = kept
    # "Got it" for everyone.
    glob = acks.load(acks.ACKS)
    if glob:
        keep = acks.apply(checks, glob, 'everyone')
        if keep != glob:  # the situation changed: forget acknowledgements no longer in force
            try:
                acks.save(acks.ACKS, keep)
            except OSError:
                pass
    status = overall(checks)
    # What the admin sees (their own "Got it" too): used for the phone alerts and the Windows
    # notifications, which are the admin's.
    mine = per.get(main_username() or '', {}) if per else {}
    admin_checks = [dict(c) for c in checks]
    acks.apply(admin_checks, mine, 'me')
    for c, a in zip(checks, admin_checks):
        if a.get('ack_scope') == 'me':
            c['ack_admin'] = True
    admin_status = overall(admin_checks)
    now = dt.datetime.now().astimezone().isoformat(timespec='seconds')
    vk = next((c['detail'].replace('version ', '') for c in checks if c['name'] == 'Vikunja server' and c['status'] == 'ok'), None)
    report = {'generated': now, 'status': status, 'admin_status': admin_status, 'checks': checks, 'vikunja': vk}
    STATE.mkdir(exist_ok=True)
    LOGS.mkdir(exist_ok=True)
    tmp = STATE / 'health.json.tmp'
    tmp.write_text(json.dumps(report, indent=1), encoding='utf-8')
    os.replace(tmp, STATE / 'health.json')
    rows = ''.join(
        f"<tr class='{c['status']}'><td>{c['status'].upper()}</td><td>{c['name']}</td><td>{c['detail']}</td><td>{c['fix']}</td></tr>"
        for c in sorted(admin_checks, key=lambda c: -order[c['status']]))
    html = f"""<!doctype html><meta charset=utf-8><title>Server health</title>
<style>body{{font:14px system-ui;margin:24px;color:#111}}table{{border-collapse:collapse;width:100%}}td{{padding:6px 10px;border-bottom:1px solid #eee;vertical-align:top}}
.fail td:first-child{{color:#d92c22;font-weight:700}}.warn td:first-child{{color:#b26a00;font-weight:700}}.ok td:first-child{{color:#4fae7b}}</style>
<h1>Server health: {status.upper()}</h1><p>{now}</p><table>{rows}</table>"""
    (STATE / 'health-report.html').write_text(html, encoding='utf-8')
    line = f"{now} {status} " + '; '.join(f"{c['name']}={c['status']}" for c in checks if c['status'] != 'ok')
    log = LOGS / 'health.log'
    if log.exists() and log.stat().st_size > 2_000_000:
        os.replace(log, LOGS / 'health.log.old')
    with open(log, 'a', encoding='utf-8') as f:
        f.write(line + '\n')
    return admin_status


def push_phone(status):
    """Phone notification through ntfy (https://ntfy.sh), when state/ntfy-topic.txt exists. Only
    when the status gets worse or recovers, never every hour. Tagged "pc": the PC's alerts
    listener does not show them again (the notifier already does)."""
    topic = read_text(STATE / 'ntfy-topic.txt')
    if not topic:
        return
    last_file = STATE / 'last-pushed-status.txt'
    last = read_text(last_file, 'ok')
    if status == last:
        return
    bad = [c for c in checks if c['status'] != 'ok' and not c.get('ack_admin')]
    # Generic on purpose: the topic is a public channel. The details are in the app
    # (Help > Status) and in state/health-report.html. Same wording as the devices' alerts
    # (alerts/decide.ts): "Tasks problem: …", "Tasks warning: …".
    if status == 'ok':
        title, body = 'Tasks: all OK again', 'Every check of the server passes.'
    else:
        first = sorted(bad, key=lambda c: (c['status'] != 'fail', c['name'] != 'Power'))[0]
        title = f"Tasks {'problem' if first['status'] == 'fail' else 'warning'}: {first['name']}"
        body = 'What to do: in the app, Help (?) > Status.'
    server = 'https://ntfy.sh/' + topic if '://' not in topic else topic
    if status != 'ok' and first['name'] == 'Power':
        # The minute watch (auto-update.ps1) has just sent its urgent notification: not twice.
        alerted = STATE / 'power-alerted.txt'
        if alerted.exists() and time.time() - alerted.stat().st_mtime < 600:
            last_file.write_text(status)
            return
    # Power is urgent (priority 5: it rings even in Do not disturb on Android).
    prio = '5' if status == 'fail' and first['name'] == 'Power' else '4' if status == 'fail' else '3'
    headers = {'Title': title.encode('ascii', 'replace').decode(), 'Priority': prio,
               'Tags': ('warning' if status != 'ok' else 'white_check_mark') + ',pc'}
    try:
        req = urllib.request.Request(server, data=body.encode('utf-8'), method='POST', headers=headers)
        urllib.request.urlopen(req, timeout=10)
        last_file.write_text(status)
        return
    except Exception:  # noqa: BLE001
        pass
    # Python's own certificate list on this PC can be out of date: Windows' curl uses Windows'.
    if WIN:
        cmd = ['curl.exe', '-s', '-f', '-m', '15', '-d', body] + [x for k, v in headers.items() for x in ('-H', f'{k}: {v}')] + [server]
        code, _, _ = run(cmd, timeout=20)
        if code == 0:
            last_file.write_text(status)


def main():
    token = read_text(STATE / 'api-token.txt') or None
    if CONTRACT_ONLY:
        info = check_vikunja()
        if info:
            check_contract(token)
        bad = [c for c in checks if c['status'] == 'fail']
        if not QUIET:
            for c in checks:
                print(f"{c['status'].upper():5} {c['name']}: {c['detail']}")
        sys.exit(1 if bad else 0)
    info = check_vikunja()
    if info:
        check_contract(token)
    check_app()
    dns = check_tailscale()
    check_public(dns)
    check_tasks()
    check_backups()
    check_offsite()
    check_device_errors()
    check_device_versions()
    check_auto_update()
    check_disk()
    check_db()
    check_automations()
    check_log()
    check_power()
    check_mains()
    check_pc_load()
    check_downtime()
    check_versions(info)
    status = write_outputs()
    push_phone(status)
    if not QUIET:
        for c in checks:
            print(f"{c['status'].upper():5} {c['name']}: {c['detail']}" + (f"\n      -> {c['fix']}" if c['status'] != 'ok' and c['fix'] else ''))
        print('Overall:', status)


if __name__ == '__main__':
    main()
