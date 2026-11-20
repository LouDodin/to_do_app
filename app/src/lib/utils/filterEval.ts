// A small evaluator for a useful subset of Vikunja's saved-filter DSL,
// run against the locally mirrored tasks so filter pages work offline.
//
// Supports: field comparisons (=, !=, >, >=, <, <=), "in" against a
// comma-separated id list (used for labels), the boolean connectives
// && and ||, parentheses, and the literal `now` for date comparisons.
// This intentionally does NOT implement every operator Vikunja's filter
// grammar allows (e.g. "like", nested date math beyond `now`) — advanced
// filters may need to fall back to the API's own filter evaluation via
// filtersApi.tasksMatching() when the app is online. Both paths are wired
// in stores/tasks.svelte.ts; this file is the offline-first fast path.

import type { VikunjaTask } from '../types';
import { hasDate } from './dates';
import type { VikunjaLabel, VikunjaProject } from '../types';

// Lets a filter name labels and projects instead of using their id numbers
// ("labels in overdue, last-day"). Every label / project with that name
// matches, so duplicates behave as one.
export interface NameResolver {
	labels: Map<string, number[]>;
	projects: Map<string, number[]>;
}

export function makeResolver(labels: VikunjaLabel[], projects: VikunjaProject[]): NameResolver {
	const add = (m: Map<string, number[]>, name: string, id: number) => {
		const k = name.trim().toLowerCase();
		m.set(k, [...(m.get(k) ?? []), id]);
	};
	const r: NameResolver = { labels: new Map(), projects: new Map() };
	for (const l of labels) add(r.labels, l.title, l.id);
	for (const p of projects) if (p.id > 0) add(r.projects, p.title, p.id);
	return r;
}

function resolveList(field: string, values: string[], names?: NameResolver): number[] {
	const out: number[] = [];
	for (const v of values) {
		const n = Number(v);
		if (v !== '' && !isNaN(n)) out.push(n);
		else if (names) {
			const map = field === 'labels' ? names.labels : field === 'project_id' || field === 'project' ? names.projects : undefined;
			out.push(...(map?.get(v.trim().toLowerCase()) ?? []));
		}
	}
	return out;
}

type Token = { type: 'word' | 'op' | 'and' | 'or' | 'lparen' | 'rparen' | 'comma'; value: string };

function tokenize(input: string): Token[] {
	const tokens: Token[] = [];
	const re = /\s*(&&|\|\||!=|>=|<=|=|>|<|\(|\)|,|'[^']*'|"[^"]*"|[^\s()&|,=<>!]+)\s*/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(input))) {
		const raw = m[1];
		if (!raw) continue;
		if (raw === '&&') tokens.push({ type: 'and', value: raw });
		else if (raw === '||') tokens.push({ type: 'or', value: raw });
		else if (raw === '(') tokens.push({ type: 'lparen', value: raw });
		else if (raw === ')') tokens.push({ type: 'rparen', value: raw });
		else if (raw === ',') tokens.push({ type: 'comma', value: raw });
		else if (['=', '!=', '>', '>=', '<', '<='].includes(raw)) tokens.push({ type: 'op', value: raw });
		else tokens.push({ type: 'word', value: raw.replace(/^['"]|['"]$/g, '') });
	}
	return tokens;
}

// `now`, `now/d` (rounded to the day), `now+1d`, `now-1w/d`, …
function resolveNow(raw: string): Date | null {
	const m = /^now((?:[+-]\d+[smhdwMy])*)(?:\/([dwMy]))?$/.exec(raw);
	if (!m) return null;
	const d = new Date();
	for (const part of m[1].matchAll(/([+-])(\d+)([smhdwMy])/g)) {
		const n = Number(part[2]) * (part[1] === '-' ? -1 : 1);
		switch (part[3]) {
			case 's': d.setSeconds(d.getSeconds() + n); break;
			case 'm': d.setMinutes(d.getMinutes() + n); break;
			case 'h': d.setHours(d.getHours() + n); break;
			case 'd': d.setDate(d.getDate() + n); break;
			case 'w': d.setDate(d.getDate() + 7 * n); break;
			case 'M': d.setMonth(d.getMonth() + n); break;
			case 'y': d.setFullYear(d.getFullYear() + n); break;
		}
	}
	if (m[2]) {
		// Round up to the end of the unit, as Vikunja does for "/d".
		if (m[2] === 'd') { d.setHours(23, 59, 59, 999); }
		else if (m[2] === 'w') { d.setDate(d.getDate() + ((7 - ((d.getDay() + 6) % 7)) - 1)); d.setHours(23, 59, 59, 999); }
		else if (m[2] === 'M') { d.setMonth(d.getMonth() + 1, 0); d.setHours(23, 59, 59, 999); }
		else if (m[2] === 'y') { d.setMonth(11, 31); d.setHours(23, 59, 59, 999); }
	}
	return d;
}

function resolveValue(field: string, raw: string): unknown {
	const now = resolveNow(raw);
	if (now) return now;
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	if (field === 'due_date' || field === 'start_date' || field === 'done_at') {
		const d = new Date(raw);
		if (!isNaN(d.getTime())) return d;
	}
	if (!isNaN(Number(raw))) return Number(raw);
	return raw;
}

function getFieldValue(task: VikunjaTask, field: string): unknown {
	switch (field) {
		case 'done':
			return task.done;
		case 'due_date':
			return hasDate(task.due_date) ? new Date(task.due_date) : null;
		case 'start_date':
			return hasDate(task.start_date) ? new Date(task.start_date) : null;
		case 'project_id':
		case 'project':
			return task.project_id;
		case 'priority':
			return task.priority ?? 0;
		case 'labels':
			return task.labels?.map((l) => l.id) ?? [];
		default:
			return undefined;
	}
}

function compare(op: string, left: unknown, right: unknown): boolean {
	if (left instanceof Date || right instanceof Date) {
		const l = left instanceof Date ? left.getTime() : left == null ? null : new Date(String(left)).getTime();
		const r = right instanceof Date ? right.getTime() : right == null ? null : new Date(String(right)).getTime();
		if (l == null || r == null || isNaN(l) || isNaN(r)) return op === '!=';
		switch (op) {
			case '=':
				return l === r;
			case '!=':
				return l !== r;
			case '>':
				return l > r;
			case '>=':
				return l >= r;
			case '<':
				return l < r;
			case '<=':
				return l <= r;
		}
	}
	switch (op) {
		case '=':
			return left === right;
		case '!=':
			return left !== right;
		case '>':
			return (left as number) > (right as number);
		case '>=':
			return (left as number) >= (right as number);
		case '<':
			return (left as number) < (right as number);
		case '<=':
			return (left as number) <= (right as number);
	}
	return false;
}

class Parser {
	tokens: Token[];
	pos = 0;
	names?: NameResolver;
	constructor(tokens: Token[], names?: NameResolver) {
		this.tokens = tokens;
		this.names = names;
	}
	peek() {
		return this.tokens[this.pos];
	}
	next() {
		return this.tokens[this.pos++];
	}

	parseExpr(): (task: VikunjaTask) => boolean {
		let left = this.parseAnd();
		while (this.peek()?.type === 'or') {
			this.next();
			const right = this.parseAnd();
			const prevLeft = left;
			left = (t) => prevLeft(t) || right(t);
		}
		return left;
	}

	parseAnd(): (task: VikunjaTask) => boolean {
		let left = this.parseTerm();
		while (this.peek()?.type === 'and') {
			this.next();
			const right = this.parseTerm();
			const prevLeft = left;
			left = (t) => prevLeft(t) && right(t);
		}
		return left;
	}

	parseTerm(): (task: VikunjaTask) => boolean {
		if (this.peek()?.type === 'lparen') {
			this.next();
			const inner = this.parseExpr();
			if (this.peek()?.type === 'rparen') this.next();
			return inner;
		}
		const fieldTok = this.next();
		if (!fieldTok || fieldTok.type !== 'word') return () => true; // malformed: fail open
		const field = fieldTok.value;
		let opTok = this.next();

		let negate = false;
		if (opTok?.type === 'word' && opTok.value.toLowerCase() === 'not') {
			negate = true;
			opTok = this.next();
		}
		if (opTok?.type === 'word' && opTok.value.toLowerCase() === 'in') {
			const values: string[] = [];
			while (this.peek()?.type === 'word') {
				values.push(this.next().value);
				if (this.peek()?.type === 'comma') this.next();
				else break;
			}
			const nums = resolveList(field, values, this.names);
			return (task) => {
				const fv = getFieldValue(task, field);
				const hit = Array.isArray(fv) ? fv.some((v) => nums.includes(v as number)) : nums.includes(fv as number);
				return negate ? !hit : hit;
			};
		}

		if (opTok?.type === 'op') {
			const valTok = this.next();
			const rawVal = valTok?.value ?? '';
			return (task) => compare(opTok.value, getFieldValue(task, field), resolveValue(field, rawVal));
		}

		return () => true;
	}
}

export function compileFilter(filterString: string, names?: NameResolver): (task: VikunjaTask) => boolean {
	try {
		const tokens = tokenize(filterString);
		const parser = new Parser(tokens, names);
		return parser.parseExpr();
	} catch {
		// A filter we can't parse should never crash the page — show
		// everything rather than silently hiding tasks.
		return () => true;
	}
}
