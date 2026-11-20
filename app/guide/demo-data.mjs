// Demo data for the user guide's screenshots (account Alex on the test server). Not a test.
const api = process.argv[2];
const j = (await (await fetch(api + '/api/v1/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'Alex', password: 'local-test-only-456' }) })).json()).token;
const H = { Authorization: 'Bearer ' + j, 'Content-Type': 'application/json' };
const call = async (m, p, b) => {
	const r = await fetch(api + '/api/v1' + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined });
	const t = await r.text();
	if (!r.ok) throw new Error(m + ' ' + p + ' ' + t);
	return t ? JSON.parse(t) : null;
};
const day = (d, h = 18) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString().replace(/\.\d+Z$/, 'Z'); };
const labels = {};
for (const [t, c] of [['today', '000000'], ['p1', 'ff473d'], ['next-action', '5f5ff6'], ['waiting-for', '5f5ff6'], ['call', '4dabf7'], ['read', '4caf50'], ['write', '4caf50'], ['errand', 'ffd152'], ['<15', 'b197fc'], ['<60', 'b197fc']])
	labels[t] = (await call('PUT', '/labels', { title: t, hex_color: c })).id;
const proj = async (title, parent = 0, description = '') => (await call('PUT', '/projects', { title, parent_project_id: parent, description })).id;
const home = await proj('HOME', 0, '[ctx:perso]');
const garden = await proj('Garden', home);
const move = await proj('Move flat', home);
const work = await proj('WORK', 0, '[ctx:pro]');
const site = await proj('Website redesign', work);
const report = await proj('Annual report', work);
const inbox = (await call('GET', '/projects')).find((p) => /inbox/i.test(p.title)).id;
const task = async (p, title, o = {}, ls = []) => {
	const t = await call('PUT', `/projects/${p}/tasks`, { title, start_date: day(-3, 9), ...o });
	for (const l of ls) await call('PUT', `/tasks/${t.id}/labels`, { label_id: labels[l] });
	return t.id;
};
await task(site, 'Send the new homepage mock-up to Sam', { due_date: day(0) }, ['today', 'next-action', 'write', '<60']);
await task(report, 'Check the figures for chapter 2', { due_date: day(-1) }, ['p1', 'next-action', 'read', '<60']);
await task(move, 'Call the removal company for a quote', {}, ['today', 'call', '<15']);
await task(site, 'Choose the colour palette', {}, ['next-action', '<60']);
await task(garden, 'Buy tulip bulbs', { due_date: day(5) }, ['next-action', 'errand', '<15']);
await task(report, 'Waiting for Marc’s comments', {}, ['waiting-for']);
await task(move, 'Cancel the internet contract', { due_date: day(9), description: 'Contract number on the **last bill**.\n\n- Give one month’s notice\n- Send the router back\n\n[Provider’s help page](https://example.com/cancel)' }, ['call', '<15']);
await task(garden, 'Prune the apple tree', { start_date: day(20, 9) });
await task(home, 'Read “Getting Things Done”, chapter 3', {}, ['next-action', 'read', '<60']);
await task(report, 'Book the meeting room for the presentation', { due_date: day(2) }, ['p1', 'next-action', '<15']);
await task(inbox, 'Idea: a reading corner in the living room', { start_date: day(0, 8) });
await task(inbox, 'Ask Julie for the recipe', { start_date: day(0, 8) });
await task(inbox, 'Renew passport', { start_date: day(0, 8) });
// A task on hold (Pending, 10 Nov 2026)
const pendingL = (await call('PUT', '/labels', { title: 'ctx:pending', hex_color: '9e9e9e' })).id;
const compost = await task(garden, 'Build a compost bin', {});
await call('PUT', `/tasks/${compost}/labels`, { label_id: pendingL });
console.log('demo data ready');
