"""Acknowledged warnings ("Got it" in Help > Status), shared by healthcheck.py and serve_app.py.

Two scopes (30 Oct 2026):
  state/acknowledged.json        {check name: {detail, at, by}}               for everyone
                                  (only the main account, the admin, can do this)
  state/acknowledged-users.json  {username: {check name: {detail, at}}}       for that person only
A warning comes back when the situation changes: for most checks when its text changes (a new
interruption, a new error); for those whose text only counts time (battery, off-PC copy, log
size), once the check has been OK again and then warns anew.

Who sees what: a check with an "account" concerns that account only (its devices, its
automations); without one it concerns the whole server, so everyone. The admin sees every check
of every account, with "account" (who it concerns) and "cause" (which device of whom); the
others see the server's checks and their own. "admin_only" checks are never shown to the others.
"""
import copy
import json
import os
import pathlib

STATE = pathlib.Path(__file__).resolve().parent.parent / 'state'
ACKS = STATE / 'acknowledged.json'
USER_ACKS = STATE / 'acknowledged-users.json'
ACK_BY_NAME = {'Power', 'Off-PC copy', 'Server log size', 'Server errors (last hour)'}
ORDER = {'fail': 2, 'warn': 1, 'ok': 0}


def base_name(name):
    return str(name).split(' · ')[0]


def load(path):
    try:
        data = json.loads(pathlib.Path(path).read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def save(path, data):
    path = pathlib.Path(path)
    path.parent.mkdir(exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding='utf-8')
    os.replace(tmp, path)


def matches(check, ack):
    return check.get('status') == 'warn' and (base_name(check['name']) in ACK_BY_NAME or ack.get('detail') == check.get('detail'))


def apply(checks, acks, scope):
    """Marks acknowledged warnings as OK (with when and for whom); returns the acks still in force."""
    keep = {}
    for c in checks:
        a = acks.get(c['name'])
        if a and matches(c, a):
            c['status'] = 'ok'
            c['acknowledged'] = a.get('at', '')
            c['ack_scope'] = scope
            keep[c['name']] = a
    return keep


def still_in_force(checks, acks):
    """The acks that still match a warning (checked before anything is marked OK)."""
    by_name = {c['name']: c for c in checks}
    return {n: a for n, a in acks.items() if n in by_name and matches(by_name[n], a)}


def overall(checks):
    return max((c['status'] for c in checks), key=lambda s: ORDER.get(s, 0), default='ok')


def visible(check, username, admin):
    if admin:
        return True
    if check.get('admin_only'):
        return False
    acc = check.get('account')
    return acc is None or (username is not None and acc == username)


def view(report, username=None, admin=False, user_acks=None):
    """What one person sees: their checks, their own acknowledgements applied, the status again."""
    r = copy.deepcopy(report or {})
    checks = [c for c in r.get('checks', []) if visible(c, username, admin)]
    if username:
        mine = (user_acks if user_acks is not None else load(USER_ACKS)).get(username, {})
        apply(checks, mine, 'me')
    if not admin:
        for c in checks:
            c.pop('admin_only', None)
    r['checks'] = checks
    r['status'] = overall(checks)
    r.pop('admin_status', None)
    r['viewer'] = {'username': username, 'admin': bool(admin)}
    return r
