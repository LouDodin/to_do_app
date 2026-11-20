"""Serves the Tasks app (static build in ../app) on 127.0.0.1:5173.

- Single-page-app fallback: an unknown page path returns index.html. A missing file
  (a path with an extension, e.g. an old /_app/immutable/*.js) is a real 404: answering it
  with index.html made the browser fail on it and show "500 Internal Error".
- /health.json comes from ../state/health.json (written by healthcheck.py), so every
  device can show the server's health.
- POST /run-health-check (signed-in users only: the Vikunja token is checked with the local
  Vikunja) starts tools/healthcheck.py now, at most once a minute; the app then re-reads
  /health.json. Added 19 Oct 2026 for the "Run a health check" button.
- Error report (21 Oct 2026), signed-in devices only:
  POST /client-log  each device sends the errors it saw (kept 62 days in state/client-log.jsonl)
  GET  /report?days=30  everything that went wrong on the server and on every device, grouped
  (health check history, automations, Vikunja warnings, off-PC copy, alerts, device errors).
- POST /ack-warning {name, scope}  (signed-in) acknowledges a warning of the health check
  (22 Oct 2026). Since 30 Oct 2026 (tools/acks.py): scope "me" for this person only, on all their
  devices; scope "everyone" (the main account, the admin, only) for every account.
- /health.json is filtered per person (30 Oct 2026): the admin sees every check of every account,
  with who it concerns and which device caused it; the others see the server's checks and their
  own; without a sign-in, only the server's checks.
- Automations for every account (26 Oct 2026), signed-in only, each account for itself:
  GET  /automations          on or off for this account, last cycle, problems (12 h), and whether
       the person switched them off on purpose (then the app leaves them off; otherwise it
       switches them on by itself: on by default, 26 Oct 2026)
  POST /automations {on, token, token_id}  on: keeps the API token the app created for this
       account in state/automations/users/<username>/ (run_poller.py starts its poller);
       off: removes it (its poller stops). The main account (the one of state/automation-token.txt)
       is always on and managed on the PC.
- Security headers on every response.
Run by the scheduled task "Tasks app" (SYSTEM, at start-up). Port: --port N (default 5173).
"""
import http.server, socketserver, pathlib, os, sys, subprocess, threading, time, urllib.request, json, re, datetime, hashlib

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import acks  # noqa: E402  (tools/acks.py)
ROOT = HERE.parent / 'app'
HEALTH = HERE.parent / 'state' / 'health.json'
VIKUNJA = os.environ.get('TASKS_VIKUNJA', 'http://127.0.0.1:3456')  # the local Vikunja (tests: another port)
_run_lock = threading.Lock()
_users = {}   # token hash -> (until, user)
_admins = {}  # user id -> (until, is admin)
_last_run = [0.0]
PORT = int(sys.argv[sys.argv.index('--port') + 1]) if '--port' in sys.argv else 5173

http.server.SimpleHTTPRequestHandler.extensions_map.update({
    '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css',
    '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.json': 'application/json',
    '.png': 'image/png', '.woff2': 'font/woff2'})

def overall(checks):
    return acks.overall(checks)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)

    def send_head(self):
        if self.path.split('?')[0] == '/report':
            user = self.user_of(self.headers.get('Authorization', ''))
            if not user:
                self.reply(401, b'{"error":"sign in first"}')
                return None
            try:
                days = int(re.search(r'days=(\d+)', self.path).group(1)) if 'days=' in self.path else 30
            except (AttributeError, ValueError):
                days = 30
            body = json.dumps(build_report(min(max(days, 1), 62), user.get('username'), self.is_admin(user)), ensure_ascii=False).encode('utf-8')
            self.reply(200, body)
            return None
        if self.path.split('?')[0] == '/automations':
            self.automations_get()
            return None
        if self.path.split('?')[0] == '/sections-restore':
            # Sections to put back in an account (13 Nov 2026: Lou's sections were wiped by a device
            # that had not received them yet). state/sections-restore/<username>.json, written by
            # Claude from a backup, given only to that user; the app writes it back into the account
            # for the projects whose sections are empty there, once.
            user = self.user_of(self.headers.get('Authorization', ''))
            if not user:
                self.reply(401, b'{"error":"sign in first"}')
                return None
            name = re.sub(r'[^A-Za-z0-9_.-]', '', str(user.get('username', '')))
            f = HERE.parent / 'state' / 'sections-restore' / f'{name}.json'
            try:
                body = f.read_bytes() if name and f.exists() else b'{}'
            except OSError:
                body = b'{}'
            self.reply(200, body)
            return None
        if self.path.split('?')[0] == '/health.json':
            try:
                report = json.loads(HEALTH.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                self.send_error(404)
                return None
            user = self.user_of(self.headers.get('Authorization', ''))
            v = acks.view(report, user.get('username') if user else None, bool(user) and self.is_admin(user))
            self.reply(200, json.dumps(v, ensure_ascii=False).encode('utf-8'))
            return None
        path = self.translate_path(self.path)
        if not os.path.exists(path):
            last = self.path.split('?')[0].rsplit('/', 1)[-1]
            if '.' in last or self.path.startswith('/_app/'):
                self.send_error(404)  # missing file: never the app shell
                return None
            self.path = '/index.html'  # client-side route -> app shell
        return super().send_head()

    def do_POST(self):
        route = self.path.split('?')[0]
        if route == '/client-log':
            return self.client_log()
        if route == '/ack-warning':
            return self.ack_warning()
        if route == '/automations':
            return self.automations_post()
        if route != '/run-health-check':
            return self.send_error(404)
        auth = self.headers.get('Authorization', '')
        if not auth.startswith('Bearer ') or not self.signed_in(auth):
            return self.reply(401, b'{"error":"sign in first"}')
        with _run_lock:
            if time.time() - _last_run[0] < 60:
                return self.reply(429, b'{"error":"a check is already running or just ran"}')
            _last_run[0] = time.time()
        flags = 0x08000000 if os.name == 'nt' else 0  # no console window
        subprocess.Popen([sys.executable, '-I', str(HERE / 'healthcheck.py'), '--quiet'], cwd=str(HERE.parent),
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
        return self.reply(202, b'{"started":true}')

    def client_log(self):
        user = self.user_of(self.headers.get('Authorization', ''))
        if not user:
            return self.reply(401, b'{"error":"sign in first"}')
        account = str(user.get('username') or '?')[:60]
        size = int(self.headers.get('Content-Length') or 0)
        if size <= 0 or size > 256 * 1024:
            return self.reply(413, b'{"error":"too large"}')
        try:
            data = json.loads(self.rfile.read(size).decode('utf-8'))
            device = str(data.get('device', '?'))[:80]
            build = str(data.get('build', ''))[:40]
            entries = data.get('entries') or []
        except Exception:  # noqa: BLE001
            return self.reply(400, b'{"error":"bad body"}')
        now = datetime.datetime.now().isoformat(timespec='seconds')
        lines = []
        for e in entries[:500]:
            if isinstance(e, dict):
                lines.append(json.dumps({'received': now, 'account': account, 'device': device, 'build': build,
                                         **{k: (str(v)[:2000] if isinstance(v, str) else v) for k, v in e.items() if k in ('at', 'last', 'kind', 'message', 'page', 'count')}},
                                        ensure_ascii=False))
        with _log_lock:
            CLIENT_LOG.parent.mkdir(exist_ok=True)
            # Which version each device runs (health check "App versions").
            try:
                devs = json.loads((STATE / 'devices.json').read_text(encoding='utf-8'))
            except Exception:  # noqa: BLE001
                devs = {}
            # One entry per account and device (30 Oct 2026: whose device is stuck, for the admin).
            devs[f'{account} · {device}'] = {'account': account, 'device': device, 'build': build, 'seen': datetime.datetime.now().astimezone().isoformat(timespec='seconds')}
            (STATE / 'devices.json').write_text(json.dumps(devs, indent=1, ensure_ascii=False), encoding='utf-8')
            with open(CLIENT_LOG, 'a', encoding='utf-8') as f:
                for line in lines:
                    f.write(line + '\n')
            prune_client_log()
        return self.reply(200, json.dumps({'stored': len(lines)}).encode())

    def ack_warning(self):
        user = self.user_of(self.headers.get('Authorization', ''))
        if not user:
            return self.reply(401, b'{"error":"sign in first"}')
        try:
            size = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(min(size, 4096)).decode('utf-8'))
            name = str(body.get('name', ''))
            scope = 'everyone' if body.get('scope') == 'everyone' else 'me'
        except Exception:  # noqa: BLE001
            return self.reply(400, b'{"error":"bad body"}')
        username = str(user.get('username') or '')
        admin = self.is_admin(user)
        if scope == 'everyone' and not admin:
            return self.reply(403, b'{"error":"only the admin can acknowledge a warning for everyone"}')
        with _log_lock:
            try:
                report = json.loads(HEALTH.read_text(encoding='utf-8'))
            except Exception:  # noqa: BLE001
                return self.reply(404, b'{"error":"no health report"}')
            check = next((c for c in report.get('checks', []) if c.get('name') == name and c.get('status') == 'warn'
                          and acks.visible(c, username, admin)), None)
            if not check:
                return self.reply(409, b'{"error":"no such warning (only warnings can be acknowledged)"}')
            at = datetime.datetime.now().astimezone().isoformat(timespec='seconds')
            if scope == 'everyone':
                glob = acks.load(acks.ACKS)
                glob[name] = {'detail': check.get('detail', ''), 'at': at, 'by': username}
                acks.save(acks.ACKS, glob)
                acks.apply(report['checks'], glob, 'everyone')
                report['status'] = acks.overall(report['checks'])
                tmp = HEALTH.with_suffix('.json.tmp')
                tmp.write_text(json.dumps(report, indent=1, ensure_ascii=False), encoding='utf-8')
                os.replace(tmp, HEALTH)
            else:
                per = acks.load(acks.USER_ACKS)
                per.setdefault(username, {})[name] = {'detail': check.get('detail', ''), 'at': at}
                acks.save(acks.USER_ACKS, per)
            v = acks.view(report, username, admin)
        return self.reply(200, json.dumps({'status': v['status'], 'scope': scope}).encode())

    # ---------------------------------------------------------------- automations per account
    def automations_get(self):
        user = self.user_of(self.headers.get('Authorization', ''))
        if not user:
            return self.reply(401, b'{"error":"sign in first"}')
        return self.reply(200, json.dumps(automation_status(user), ensure_ascii=False).encode('utf-8'))

    def automations_post(self):
        user = self.user_of(self.headers.get('Authorization', ''))
        if not user:
            return self.reply(401, b'{"error":"sign in first"}')
        try:
            size = int(self.headers.get('Content-Length') or 0)
            body = json.loads(self.rfile.read(min(size, 8192)).decode('utf-8'))
        except Exception:  # noqa: BLE001
            return self.reply(400, b'{"error":"bad body"}')
        if is_main_account(user):
            return self.reply(409, b'{"error":"the main account is managed on the PC"}')
        d = USERS_DIR / safe_name(user.get('username', ''))
        if body.get('on'):
            token = str(body.get('token') or '')
            if not re.fullmatch(r'tk_[0-9a-f]{20,80}', token):
                return self.reply(400, b'{"error":"no valid token"}')
            if token_owner(token) != user.get('id'):
                return self.reply(403, b'{"error":"this token is not yours"}')
            d.mkdir(parents=True, exist_ok=True)
            (d / 'api_token.txt').write_text(token, encoding='utf-8')
            (d / 'token_id.txt').write_text(str(body.get('token_id') or ''), encoding='utf-8')
            (d / 'poller_role.txt').write_text('server', encoding='utf-8')
            try:
                (d / 'declined.txt').unlink()
            except OSError:
                pass
        else:
            # Switched off on purpose: remembered, so the app does not switch them on again by itself.
            d.mkdir(parents=True, exist_ok=True)
            (d / 'declined.txt').write_text(datetime.datetime.now().isoformat(timespec='seconds'), encoding='utf-8')
            for f in ('api_token.txt',):
                try:
                    (d / f).unlink()
                except OSError:
                    pass
        return self.reply(200, json.dumps(automation_status(user), ensure_ascii=False).encode('utf-8'))

    def user_of(self, auth):
        """The signed-in Vikunja user ({id, username, ...}) for this Authorization header, or None.
        Kept 2 minutes per token, so that /health.json and the device reports stay cheap."""
        if not auth.startswith('Bearer '):
            return None
        key = hashlib.sha256(auth.encode()).hexdigest()
        hit = _users.get(key)
        if hit and hit[0] > time.time():
            return hit[1]
        try:
            req = urllib.request.Request(VIKUNJA + '/api/v1/user', headers={'Authorization': auth})
            with urllib.request.urlopen(req, timeout=10) as r:
                user = json.loads(r.read().decode('utf-8')) if r.status == 200 else None
        except Exception:  # noqa: BLE001
            user = None
        if user:
            if len(_users) > 500:
                _users.clear()
            _users[key] = (time.time() + 120, user)
        return user

    def is_admin(self, user):
        """The main account (the one of state/automation-token.txt) runs the server."""
        key = user.get('id')
        hit = _admins.get(key)
        if hit and hit[0] > time.time():
            return hit[1]
        val = is_main_account(user)
        _admins[key] = (time.time() + 300, val)
        return val

    def signed_in(self, auth):
        try:
            req = urllib.request.Request(VIKUNJA + '/api/v1/user', headers={'Authorization': auth})
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status == 200
        except Exception:  # noqa: BLE001
            return False

    def reply(self, code, body):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, file, ctype):
        try:
            f = open(file, 'rb')
        except OSError:
            self.send_error(404)
            return None
        size = os.fstat(f.fileno()).st_size
        self.send_response(200)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(size))
        self.end_headers()
        return f

    def end_headers(self):
        p = self.path.split('?')[0]
        if getattr(self, '_error', False):
            self.send_header('Cache-Control', 'no-store')  # an error must never be kept
        elif p in ('/', '/index.html', '/sw.js', '/registerSW.js', '/manifest.webmanifest', '/health.json') or p.startswith('/guide/'):
            # /guide/: the user guide in the app (10 Nov 2026), checked for a newer copy each time
            self.send_header('Cache-Control', 'no-cache')
        elif p.startswith('/_app/immutable/'):
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        super().end_headers()

    def send_error(self, *a, **k):
        self._error = True
        super().send_error(*a, **k)

    def log_message(self, *a):
        pass

ROOTDIR = HERE.parent
USERS_DIR = ROOTDIR / 'state' / 'automations' / 'users'
MAIN_TOKEN = ROOTDIR / 'state' / 'automation-token.txt'
VIKUNJA_DB = pathlib.Path(os.environ.get('TASKS_VIKUNJA_DB', str(ROOTDIR / 'vikunja' / 'db' / 'vikunja.db')))


def safe_name(name):
    return re.sub(r'[^A-Za-z0-9_.-]', '_', name)[:60] or 'user'


def token_owner(token):
    """The id of the account an API token belongs to (read-only look in Vikunja's database)."""
    import sqlite3
    try:
        c = sqlite3.connect(f'file:{VIKUNJA_DB}?mode=ro', uri=True, timeout=5)
        import hashlib
        # Newer tokens are stored by their SHA-256, older ones (before Vikunja 2.x) by their last 8 characters.
        rows = c.execute('select owner_id from api_tokens where token_sha256 = ? or token_last_eight = ?',
                         (hashlib.sha256(token.encode()).hexdigest(), token[-8:])).fetchall()
        c.close()
        owners = {r[0] for r in rows}
        return owners.pop() if len(owners) == 1 else None
    except Exception:  # noqa: BLE001
        return None


def is_main_account(user):
    try:
        main = MAIN_TOKEN.read_text(encoding='utf-8').strip()
    except OSError:
        return False
    return bool(main) and token_owner(main) == user.get('id')


def automation_status(user):
    main = is_main_account(user)
    d = (ROOTDIR / 'state' / 'automations') if main else USERS_DIR / safe_name(user.get('username', ''))
    on = main or (d / 'api_token.txt').is_file()
    beat = ''
    try:
        beat = (d / 'heartbeat.txt').read_text(encoding='utf-8').strip()
    except OSError:
        pass
    errors = []
    cutoff = datetime.datetime.now() - datetime.timedelta(hours=12)
    try:
        for line in (d / 'errors.log').read_text(encoding='utf-8').splitlines()[-200:]:
            stamp, _, rest = line.partition(' ')
            try:
                if datetime.datetime.fromisoformat(stamp) >= cutoff:
                    errors.append(rest.strip()[:200])
            except ValueError:
                continue
    except OSError:
        pass
    token_id = ''
    try:
        token_id = (d / 'token_id.txt').read_text(encoding='utf-8').strip()
    except OSError:
        pass
    declined = (not main) and (d / 'declined.txt').is_file()
    return {'on': on, 'main': main, 'declined': declined, 'last_cycle': beat, 'errors': errors[-5:], 'token_id': token_id}


LOGS = ROOTDIR / 'logs'
STATE = ROOTDIR / 'state'
CLIENT_LOG = STATE / 'client-log.jsonl'
_log_lock = threading.Lock()
_pruned = [0.0]


def prune_client_log():
    """Keeps 62 days (checked at most once an hour)."""
    if time.time() - _pruned[0] < 3600 or not CLIENT_LOG.exists():
        return
    _pruned[0] = time.time()
    cutoff = (datetime.datetime.now() - datetime.timedelta(days=62)).isoformat()
    keep = [l for l in CLIENT_LOG.read_text(encoding='utf-8', errors='replace').splitlines() if _received(l) >= cutoff[:19]]
    CLIENT_LOG.write_text('\n'.join(keep) + ('\n' if keep else ''), encoding='utf-8')


def _received(line):
    try:
        return json.loads(line).get('received', '')[:19]
    except ValueError:
        return ''


def _lines_since(path, cutoff, date_at=0):
    """Lines of a log file whose timestamp (ISO, at position date_at) is after cutoff."""
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                stamp = line[date_at:date_at + 19]
                if stamp[:4].isdigit() and stamp >= cutoff:
                    yield line.rstrip('\n')
    except OSError:
        return


def _group(items):
    """[(when, key, extra[, count])] -> [{message, count, first, last, extra}] most frequent first."""
    g = {}
    for it in items:
        when, key, extra = it[:3]
        e = g.setdefault(key, {'message': key, 'count': 0, 'first': when, 'last': when, 'extra': extra})
        e['count'] += it[3] if len(it) > 3 else 1
        e['first'] = min(e['first'], when)
        e['last'] = max(e['last'], when)
    return sorted(g.values(), key=lambda e: (-e['count'], e['message']))[:60]


def build_report(days, username=None, admin=True):
    now = datetime.datetime.now()
    cutoff = (now - datetime.timedelta(days=days)).isoformat()[:19]
    rep = {'generated': now.isoformat(timespec='seconds'), 'days': days}
    try:
        rep['health_now'] = acks.view(json.loads((STATE / 'health.json').read_text(encoding='utf-8')), username, admin)
    except (OSError, ValueError):
        rep['health_now'] = None
    # Hourly health check: how many hours each check was not OK.
    hist = []
    for line in _lines_since(LOGS / 'health.log', cutoff):
        parts = line.split(' ', 2)
        if len(parts) == 3 and parts[1] != 'ok':
            for item in parts[2].split(';'):
                if '=' in item:
                    name, st = item.strip().rsplit('=', 1)
                    hist.append((parts[0][:16], f'{name} ({st})', None))
    rep['health_history'] = _group(hist)
    # Automations (the PC's GTD poller): errors.
    auto = []
    for line in _lines_since(LOGS / 'automations.log', cutoff):
        if ' ERROR ' in line or 'HTTPError' in line:
            msg = re.sub(r"(\\x00)+", '…', line[27:].strip())
            msg = re.sub(r'\d{2,}', 'N', msg)[:200]
            auto.append((line[:16], msg, None))
    rep['automations'] = _group(auto)
    # Vikunja: warnings and errors (405 on /filters is a known, harmless gap; 401 = expired sign-in, retried).
    vk = []
    for line in _lines_since(ROOTDIR / 'vikunja' / 'vikunja.log', cutoff, 5):
        if 'level=WARN' not in line and 'level=ERROR' not in line:
            continue
        if 'status=405' in line and '/filters' in line:
            continue
        uri = re.search(r'uri="?([^" ]+)', line)
        status = re.search(r'status=(\d+)', line)
        err = re.search(r'err="([^"]*)"', line)
        agent = re.search(r'user_agent="([^"]*)"', line)
        key = f"{status.group(1) if status else ''} {re.sub(r'/[0-9]+', '/N', uri.group(1).split('?')[0]) if uri else ''} {err.group(1)[:120] if err else ''}".strip()
        if not uri and not status:
            key = re.sub(r'\d{2,}', 'N', line[30:200])
        ua = agent.group(1) if agent else ''
        who = ('phone' if re.search('Android|iPhone|Mobile', ua) else 'Mac' if 'Macintosh' in ua else 'Windows PC' if 'Windows' in ua else ua[:40]) if ua else None
        vk.append((line[5:21], key, who))
    rep['vikunja'] = _group(vk)
    # Off-PC copy (to the Mac): failed runs.
    off = []
    for f in sorted(LOGS.glob('weekly-safeguard-*.txt')):
        stamp = f.stem.replace('weekly-safeguard-', '')
        when = f'{stamp[:10]}T{stamp[11:13]}:{stamp[13:15]}'
        if when < cutoff[:16]:
            continue
        for line in f.read_text(encoding='utf-8', errors='replace').splitlines():
            if 'XX ' in line:
                off.append((when, re.sub(r'\d{4}-\d{2}-\d{2}', 'DATE', line.strip())[:200], None))
    rep['offsite'] = {'failures': _group(off)}
    for name in ('offsite-last.txt', 'offsite-sent.txt'):
        try:
            rep['offsite'][name] = (STATE / name).read_text(encoding='utf-8-sig').strip()
        except OSError:
            pass
    # Alerts listener on this PC (ntfy).
    al = [(l[:16], re.sub(r'\d{2,}', 'N', l[20:].strip())[:160], None) for l in _lines_since(LOGS / 'alerts-listener.log', cutoff)]
    rep['alerts'] = _group(al)
    # App versions installed on the PC.
    deploys = sorted(f.stem.replace('deploy-app-', '') for f in LOGS.glob('deploy-app-*.txt'))
    rep['deploys'] = [d for d in deploys if d.replace('_', 'T')[:13] >= cutoff[:13]]
    try:
        rep['app_live'] = (ROOTDIR / 'app' / 'version.txt').read_text().strip()
    except OSError:
        rep['app_live'] = None
    # Errors seen on the devices (sent by the app).
    dev = []
    try:
        raw = CLIENT_LOG.read_text(encoding='utf-8', errors='replace').splitlines()
    except OSError:
        raw = []
    for line in raw:
        try:
            e = json.loads(line)
        except ValueError:
            continue
        when = str(e.get('at') or e.get('received') or '')[:19]
        if when < cutoff:
            continue
        acc = e.get('account')
        if not admin and acc != username:
            continue  # someone else's device: only the admin sees it
        who = f"{acc} · {e.get('device')}" if acc else e.get('device')
        dev.append((when[:16], f"[{e.get('kind', 'error')}] {e.get('message', '')}", who, int(e.get('count') or 1)))
    rep['devices'] = _group(dev)
    if not admin:
        # The server's own logs can mention other accounts: they are for the admin.
        for k in ('health_history', 'automations', 'vikunja', 'alerts'):
            rep[k] = []
        rep['offsite'] = {'failures': []}
    return rep


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    Server(('127.0.0.1', PORT), Handler).serve_forever()
