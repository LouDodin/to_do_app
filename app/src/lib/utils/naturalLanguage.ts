// Parses the quick-add title field for the `#project @label >startDate !dueDate`
// indicators described in the spec ("Saisie en langage naturel"). Each
// recognized token is stripped from the returned title.
//
// Dates understood after > (start) or ! (due), in English or French:
//   today / aujourd'hui, tomorrow / tmrw / demain, monday..sunday, mon..sun / lundi..dimanche,
//   in 3 days / dans 3 jours, in 2 weeks / dans 2 semaines, +3, 3d, 2w, next week / semaine prochaine,
//   DD/MM or DD/MM/YYYY, and an optional time after the date: "!demain 14h", "!fri 9h30".
// Anything unrecognized after the indicator character is left as-is in the
// title (safer than silently eating a project/label reference that only
// looked like a date).

export interface ParsedInput {
	title: string;
	projectQuery: string | null;
	labelQueries: string[];
	startDate: Date | null;
	dueDate: Date | null;
}

const WEEKDAYS_FR = [
	'dimanche',
	'lundi',
	'mardi',
	'mercredi',
	'jeudi',
	'vendredi',
	'samedi'
];

const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAYS_EN3 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function plusDays(n: number): Date {
	const d = new Date();
	d.setDate(d.getDate() + n);
	return d;
}

function parseDateToken(raw: string): { date: Date | null; consumedLength: number } {
	const r = parseDateOnly(raw);
	if (!r.date) return r;
	// Optional time: "14h", "9h30"
	const t = raw.slice(r.consumedLength).match(/^\s+(\d{1,2})h(\d{2})?/i);
	if (t && +t[1] < 24 && (!t[2] || +t[2] < 60)) {
		r.date.setHours(+t[1], t[2] ? +t[2] : 0, 0, 0);
		return { date: r.date, consumedLength: r.consumedLength + t[0].length };
	}
	return r;
}

function parseDateOnly(raw: string): { date: Date | null; consumedLength: number } {
	const lower = raw.toLowerCase();

	const inN = lower.match(/^(?:in|dans)\s+(\d+)\s+(days?|jours?|weeks?|semaines?)/);
	if (inN) {
		const n = parseInt(inN[1], 10) * (/^(weeks?|semaines?)$/.test(inN[2]) ? 7 : 1);
		return { date: plusDays(n), consumedLength: inN[0].length };
	}
	const compact = lower.match(/^\+?(\d+)([dwjs])?(?![\d/])/);
	if (compact && (compact[2] || lower.startsWith('+'))) {
		const n = parseInt(compact[1], 10) * (compact[2] === 'w' || compact[2] === 's' ? 7 : 1);
		return { date: plusDays(n), consumedLength: compact[0].length };
	}
	const nextWeek = lower.match(/^(next\s+week|semaine\s+prochaine)/);
	if (nextWeek) {
		const d = new Date();
		d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); // next Monday
		return { date: d, consumedLength: nextWeek[0].length };
	}
	for (const w of ['today', 'tod']) if (lower.startsWith(w)) return { date: new Date(), consumedLength: w.length };
	for (const w of ['tomorrow', 'tmrw', 'tom']) if (lower.startsWith(w)) return { date: plusDays(1), consumedLength: w.length };
	for (const list of [WEEKDAYS_EN, WEEKDAYS_EN3]) {
		for (let i = 0; i < 7; i++) {
			if (lower.startsWith(list[i])) {
				let delta = (i - new Date().getDay() + 7) % 7;
				if (delta === 0) delta = 7;
				return { date: plusDays(delta), consumedLength: list[i].length };
			}
		}
	}

	// Longest-match first so "dans 3 jours" isn't cut short at "dans".
	const relativeMatch = lower.match(/^dans (\d+) jours?/);
	if (relativeMatch) {
		const d = new Date();
		d.setDate(d.getDate() + parseInt(relativeMatch[1], 10));
		return { date: d, consumedLength: relativeMatch[0].length };
	}

	if (lower.startsWith('aujourd\'hui') || lower.startsWith('aujourdhui')) {
		return { date: new Date(), consumedLength: lower.startsWith('aujourd\'hui') ? 11 : 10 };
	}
	if (lower.startsWith('demain')) {
		const d = new Date();
		d.setDate(d.getDate() + 1);
		return { date: d, consumedLength: 6 };
	}

	for (let i = 0; i < WEEKDAYS_FR.length; i++) {
		const name = WEEKDAYS_FR[i];
		if (lower.startsWith(name)) {
			const d = new Date();
			const currentDay = d.getDay();
			let delta = (i - currentDay + 7) % 7;
			if (delta === 0) delta = 7; // "lundi" said on a Monday means next Monday
			d.setDate(d.getDate() + delta);
			return { date: d, consumedLength: name.length };
		}
	}

	// DD/MM or DD/MM/YYYY
	const absoluteMatch = raw.match(/^(\d{1,2})\/(\d{1,2})(\/(\d{2,4}))?/);
	if (absoluteMatch) {
		const day = parseInt(absoluteMatch[1], 10);
		const month = parseInt(absoluteMatch[2], 10) - 1;
		const year = absoluteMatch[4]
			? parseInt(absoluteMatch[4].length === 2 ? '20' + absoluteMatch[4] : absoluteMatch[4], 10)
			: new Date().getFullYear();
		return { date: new Date(year, month, day), consumedLength: absoluteMatch[0].length };
	}

	return { date: null, consumedLength: 0 };
}

// Matches one indicator + its argument word (letters/digits/accents/slash,
// stopping at the next space-indicator or end of string).
const TOKEN_RE = /([#@>!])((?:(?:in|dans)\s+\d+\s+(?:days?|jours?|weeks?|semaines?)|next\s+week|semaine\s+prochaine)(?:\s+\d{1,2}h\d{0,2})?|[^\s#@>!]+(?:\s+\d{1,2}h\d{0,2})?)/gi;

export function parseQuickAdd(raw: string): ParsedInput {
	let projectQuery: string | null = null;
	const labelQueries: string[] = [];
	let startDate: Date | null = null;
	let dueDate: Date | null = null;

	const title = raw
		.replace(TOKEN_RE, (match, indicator: string, arg: string) => {
			if (indicator === '#') {
				projectQuery = arg.trim();
				return '';
			}
			if (indicator === '@') {
				labelQueries.push(arg.trim());
				return '';
			}
			if (indicator === '>' || indicator === '!') {
				const { date } = parseDateToken(arg.trim());
				if (date) {
					if (indicator === '>') startDate = date;
					else dueDate = date;
					return '';
				}
				return match; // unrecognized date text: leave token untouched in title
			}
			return match;
		})
		.replace(/\s{2,}/g, ' ')
		.trim();

	return { title, projectQuery, labelQueries, startDate, dueDate };
}
