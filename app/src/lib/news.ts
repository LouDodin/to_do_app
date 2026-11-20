// Updates (10 Nov 2026): what changed for the people using the app, newest first, since the app
// moved to the PC. Each device shows the entries it has not shown yet once, in the "What's new"
// box; Help centre > Updates lists them all and searches them. Only what a user notices goes here,
// in plain words (the PC's own changes are in the admin's changelog). Add an entry with every
// update that changes something visible. Plain text: shown as written, never as Markdown.
//
// One feature, one place (11 Nov 2026, Lou): when a feature is reworked, its earlier lines are
// taken out of the older entries and the newest entry describes it in full, as it is now. Several
// changes on the same day make one entry, under a new id so that devices which already showed the
// morning's entry show the whole day again.
export type NewsEntry = { id: string; date: string; title: string; items: string[] };

export const NEWS: NewsEntry[] = [
	{
		id: '2026-11-20',
		date: '20 Nov 2026',
		title: 'Ongoing tasks, a fuller New task, Today ⇄ This week',
		items: [
			'Ongoing: a switch on a task’s page. Ongoing tasks have their own block at the top of the home page, and come first in Tomorrow and the Weekly review.',
			'The + button opens the full New task window: type and press Enter for the Inbox, or fill in the rest (project, dates, reminder, repeat, labels, notes). With a project, the task skips the Inbox. The cart is still there.',
			'On a computer, drag a task from Today to This week on the home page, or back: its label follows.',
			'today and week together no more: giving one takes off the other. A task due today or earlier gets today by itself; one due later this week gets week.',
			'On the phone, giving a project to an Inbox task (long press › Project) keeps it in the Inbox until you validate it.'
		]
	},
	{
		id: '2026-11-19c',
		date: '19 Nov 2026',
		title: 'Reminders, Inbox to project in one move, + on the home page',
		items: [
			'Reminders: on a task’s page, Remind sets a day and a time; your phone gets a notification then (tap it to open the task). It uses your ntfy topic (Settings › Alerts) and the PC; the text never contains the task.',
			'From the Inbox on a computer: drag a task onto its project in the menu. It is moved and validated in one go (also when you choose its project in the row, or with Move for several).',
			'The New task window lists all your labels (it showed 8), and on the phone the list slides and no longer brings up the keyboard.',
			'Staying signed in: a device is no longer signed out when two windows renew the session at the same moment, and it stays signed in for a year after you last used it. Signed out, a device no longer fills the Error report while it waits on the sign-in screen.',
			'On the home page, + next to Today, This week, Red and Available: a new task with that block’s label.',
			'Several tasks ticked: Abandon in the bar sends them all to the Bin as abandoned.',
			'While you edit a task’s title in a list, its labels stay in view, and + adds one straight away.'
		]
	},
	{
		id: '2026-11-15b',
		date: '15 Nov 2026',
		title: 'Tidier on the phone; a moon and a calendar to choose',
		items: [
			'On the phone: the search box shows only its magnifier when space is short, and the green dot no longer sits on it.',
			'A task’s page on the phone: the day and the time side by side, the time no longer cut; Link a task, Duplicate, Abandon and Delete fit on the line.',
			'The New task window on the phone: the Start, Due and Labels lists open across the window, never past the screen’s edge.',
			'Tomorrow (the evening review): only what is ahead, no figures. Clean the Inbox first (Open takes you there; its box ticks itself once the Inbox is empty, or tick it yourself), then your list for tomorrow, then To consider, in groups: Planned for today, not done, Due by tomorrow, This week, Next actions, Due in the next two weeks, Due later, Recently added. A moon (like Tomorrow in the menu) in place of the circle chooses a task for tomorrow; filled, it is chosen, and a tap takes it off.',
			'Weekly review, in three steps: Clean up (tick Desktop, Downloads, Emails and the Inbox, a click on the line; the Inbox also ticks itself once it is empty, and Open takes you there), Projects and tasks on hold (no next action, pending, waiting for, untouched), and Plan the coming week: your list for the week, then Planned this week, not done, Overdue, Due in the next 7 days and the same groups as Tomorrow. In place of the circle of each task: the calendar (like Weekly review in the menu) puts it on the week’s list, the moon on tomorrow’s, so on Sundays it is the only review you need. On the phone they sit one above the other; the line under each task runs full width.',
			'The week’s list (label “week”): the calendar in the Weekly review. These tasks have their own block on the home page (This week, under Today) and a group in Tomorrow; on Upcoming, those with no day yet wait at the top, under To schedule.',
			'Upcoming on the phone: bigger places to tap for completing, planning and + on each day.',
			'No coloured emoji left (the link and the tick in the task menus are grey line icons).'
		]
	},
	{
		id: '2026-11-14f',
		date: '14 Nov 2026',
		title: 'Tomorrow, the Weekly review and Upcoming, simpler; All Pro Perso at the top',
		items: [
			'At the top: All, Pro and Perso written side by side (click one); the house takes you Home. The home page no longer has Show completed.',
			'The Inbox is a page of its own, first in the menu (g i): Inbox, Shopping, Upcoming, Tomorrow, Weekly review, Bin, then your projects, filters and labels. No count next to Shopping.',
			'Upcoming (in the menu, g c): a strip of the next 7 days at the top (a dot under a day with something), then Overdue and To schedule, then every day one by one, for two months at least and up to your last planned task, with the name of each month between them. Plan a task for a day with the calendar button on its row, or drag it onto a day; + next to a day adds a task for that day.',
			'Labels in the menu: the ones the app and the automations act on come first, on a line of their own (today, week, next-action, p1, overdue, last-day, waiting-for, shopping); your other labels follow below. Keep their names: renaming one stops what it drives.',
			'The cart (Shopping) is a grey line icon like the others, in the menu, in the New task box (shaped like Add, filled once ticked: with a title typed, it goes on the Shopping list at once) and on a task’s page. Giving a task in the Inbox the label “shopping” does the same.'
		]
	},
	{
		id: '2026-11-13g',
		date: '13 Nov 2026',
		title: 'A new project page, a new task window, a Black theme',
		items: [
			'A project’s page, redone: plain and compact. Next to the name, + adds a task, and on a computer every option is in view: the order (Oldest first, Newest first, My order: drag a task onto another), Completed and Pending (show them or not), Mark pending and Archive (or Restore). On the phone they are under ⋯.',
			'Sections: drag one by its title bar to move it (the handle ⠿ appears when you point at it; on the phone it is always there, faintly). › folds it, + adds a task to it, ⋯ has Move up, Move down and Delete. Click a section’s name to rename it. No numbers of tasks: just the tasks.',
			'A new task, in a small window (+ next to a project, a section or a day): the title, notes, then one row of buttons: project, section, start, due (Today, Tomorrow, In a week, or a date), labels (each label chosen shows by its name, with ×). Enter: add · ⌘/Ctrl+Enter: add another · Esc: close. A click outside first closes an open menu, then the window (nothing is added).',
			'Sub-projects are listed at the bottom of a parent project’s page, each with its tasks (open ones only: not pending, not archived).',
			'Pending: put a task on hold from its page. It then shows nowhere (home page, Tomorrow, Weekly review, Upcoming, filters, labels), whatever its labels or dates, except in the Weekly review’s Pending tasks step and on its project’s page with Pending.',
			'Black theme (Help centre › Settings › Appearance, on each device): a black page with white text and dot-matrix titles, in the spirit of Nothing phones. “Like the device” follows the phone or computer (light by day, black when it is set to dark). “Labels in shades of grey” takes the colours away. With Black, the app’s icon is black too: remove the app from the home screen and add it again to get it.',
			'Abandon: the task now goes to the Bin, marked “Abandoned” (kept 30 days); Restore there brings it back as a task to do. Tasks abandoned earlier join it too.',
			'Sign-in: only your username and password are asked (Change server if needed), with the names password managers look for: Bitwarden can fill them, also on the phone.',
			'Sections and your own order are safe across devices: a device that has not received them yet can no longer erase them (this happened to one project on 13 Nov; its sections were put back).'
		]
	},
	{
		id: '2026-11-11d',
		date: '11 Nov 2026',
		title: 'Several tasks at once, several labels at once, a clearer task page',
		items: [
			'Several tasks at once: tick the small box on the left of a task (it appears when you point at it). While tasks are ticked, a click anywhere on a task only ticks or unticks it: nothing else changes by mistake.',
			'Shift+click ticks a range; Select all (or Ctrl/⌘+A) the whole list; Ctrl/⌘-click also works. Phone: long-press a task, then Select several tasks, and tap the others. You can drag the ticked tasks together.',
			'To stop: × on the bar, Esc, or a click on an empty part of the page.',
			'A white bar at the bottom: Complete, Move (project or section), Labels (✓ all have it, – some do), Due (today, tomorrow, in a week, a date), then Pending, Shopping and Inbox in one click, and Bin (no confirmation: Ctrl/⌘+Z brings them back). Each action ends the selection.',
			'A task’s page is more compact: the title, two switches (🛒 Shopping, Pending), then one line per detail (project, section, labels, start, due, repeat), the notes, and Duplicate / Delete at the bottom. Explanations are in tooltips: point at a switch, or at “Markdown” above the notes.',
			'The project shows where it sits (“in HOME”); ↩ Inbox sends the task back to the Inbox. 🔗 Link a task (precedes / follows) opens only when you need it.',
			'Menu > Projects > Show archived: archived projects appear under their parent project, greyed out and tagged “archived”, like pending ones.',
			'Dates: choosing the day is enough; the time is optional. What you chose is kept when you click elsewhere to close the window.',
			'Abandon a task: it was not done and should not be done any more. On its page (Abandon, next to Delete), in the phone’s long-press menu, or in the Weekly review’s Untouched step. It leaves your lists, shows ✕ and “abandoned” among the completed tasks, and never counts as done; Reopen brings it back.',
			'Several labels at once: open a label from the menu, then click other labels in the menu to add them (or click a marked one to take it off); the list follows at once. On the page: × takes a label off, + adds one, and All of them / Any of them. On the phone, use + on the page.',
			'Fewer explanations on the pages: just what you need. Everything is still explained in the user guide (? › Help).'
		]
	},
	{
		id: '2026-11-10b',
		date: '10 Nov 2026',
		title: 'One clear layout, and this Updates tab',
		items: [
			'Top bar: on the left where you are (☰ menu, Home, the view, back and forward), search in the middle, on the right what you do (undo, redo, + New task) and ? for the Help centre.',
			'One menu (☰) for every place: the pages, then your projects, filters and labels, and the Bin at the bottom. Click a heading to fold it. The separate right panel is gone: filters and labels are in the menu.',
			'? opens the Help centre, in four tabs: Help (install, how the app is organised, shortcuts, the full user guide), Updates (every update, with a search box), Status (server, sync, warnings, error report) and Settings (alerts, automations, your data, label colours, maintenance, sign out).',
			'A dot on ? says there is something to see: red or orange in Status, blue for updates you have not seen. The warning bar and the sync dot open Status. The same on the phone.',
			'After each update, a small “What’s new” box says what changed (once per device); All updates opens this tab.',
			'Shortcuts: g p Shopping, g u Updates, g s Settings.',
			'Phone: Shopping is in the menu (no longer under the filter box of the home page).'
		]
	},
	{
		id: '2026-11-10',
		date: '10 Nov 2026',
		title: 'Markdown, sections on every device',
		items: [
			'Descriptions can be written in Markdown: **bold**, *italic*, - lists, # titles, [text](https://…) links. Click the text to edit it.',
			'Sections and your own order now follow your account: what you set on the computer appears on the phone, and the other way round.'
		]
	},
	{
		id: '2026-11-06',
		date: '6 Nov 2026',
		title: 'Shopping, undo',
		items: [
			'🛒 Shopping option in the New task box and on a task’s page: the item skips the Inbox and goes to the Shopping page, grouped by shop.',
			'Undo / redo: Ctrl/⌘+Z and Ctrl/⌘+Shift+Z, or ↶ ↷ at the top. The last 50 changes, until the app is closed.',
			'Task titles start with a capital letter.',
			'Password managers no longer pop up when you type a task.',
			'Menus open upwards when there is no room below.'
		]
	},
	{
		id: '2026-11-05',
		date: '5 Nov 2026',
		title: 'Deleting a project never loses a task',
		items: [
			'Deleting a project that holds archived sub-projects: every task is moved out first (open ones to the Inbox, completed ones to the Bin) and checked on the server; if one did not move, nothing is deleted.',
			'Archiving a project checks with the server that none of its tasks is still open.',
			'Two windows of the app on the same computer no longer sign each other out.',
			'Something already done (a task already deleted, a label already there) is no longer reported as a sync error.'
		]
	},
	{
		id: '2026-10-30',
		date: '30 Oct 2026',
		title: 'Warnings: whom they concern',
		items: [
			'Each account sees the server’s warnings and its own. The admin also sees everyone’s, with whom they concern and which device causes them, to help before being asked.',
			'Got it on a warning (orange) hides it for you, on all your devices, until the situation changes; problems (red) stay until fixed. The admin can also hide a warning for everyone.',
			'The Error report only contains your own devices.'
		]
	},
	{
		id: '2026-10-29',
		date: '29 Oct 2026',
		title: 'Install the app on any phone',
		items: [
			'Install the app is shown on every device where it is not installed yet, with the steps for your browser (Firefox, Samsung Internet, Safari, Chrome, Edge…).',
			'Opened from WhatsApp, Instagram or Gmail: the app says how to open it in your browser first, which can install it.'
		]
	},
	{
		id: '2026-10-26',
		date: '26 Oct 2026',
		title: 'Single tasks, automations for everyone, your data',
		items: [
			'Every open task of a project whose name starts with “Single tasks” shows in Available on the home page.',
			'Automations work for every account, on by default: next-action passed on, overdue labels, start dates… Turn them off in Settings > Automations.',
			'Download your data: a table for Excel, or everything, made on your device, even when the server is off. A reminder once a month.'
		]
	},
	{
		id: '2026-10-25',
		date: '25 Oct 2026',
		title: 'The filter box on the home page',
		items: [
			'At the top of the home page: type to see the matching tasks at once (title, notes, labels, project). Enter turns a label into a chip; add a due date or a project when needed; × or Esc clears it.',
			'Updates install themselves: every device moves to the latest version of the app by itself, properly, even on a slow connection, when you are not typing.',
			'Losing the network shows “offline”, not an error.'
		]
	},
	{
		id: '2026-10-22',
		date: '22 Oct 2026',
		title: 'Small fixes',
		items: [
			'Deleting a task takes you back to the page you came from.',
			'An app left open during an update opens the new pages by itself; the error page offers Reload and Home.'
		]
	},
	{
		id: '2026-10-21',
		date: '21 Oct 2026',
		title: 'Error report, and a safer Inbox',
		items: [
			'Error report (30 days): everything that went wrong, on the server and on your devices, in one text to paste to Claude.',
			'A task you change no longer drops to the bottom of the Inbox, and a task shown in the Inbox stays there until you validate, complete or bin it.',
			'Warnings use the same words everywhere: problem (red, act today), warning (orange, when convenient).'
		]
	},
	{
		id: '2026-10-19',
		date: '19 Oct 2026',
		title: 'Validation, reviews redesigned, keyboard',
		items: [
			'A task stays in the Inbox until you validate it: the Validate bar on its page, or v.',
			'New task: one text box; the task goes to the Inbox and nothing you type is read as a date or label.',
			'Phone: long-press a task for its menu; the back gesture closes what is open instead of leaving the page.',
			'Keyboard: / to search; g h, g i, g t, g w, g b to jump to a page.',
			'A sign-in lasts 30 days; the sign-in page shows the changes kept on the device.'
		]
	},
	{
		id: '2026-10-10',
		date: '10 Oct 2026',
		title: 'The app on its own server: installable, works offline',
		items: [
			'Install the app: its own icon and window. It opens with no network and sends your changes once back online.',
			'Phone layout: full-width titles, the round + button, tap a task to open it.',
			'Share to Tasks on Android, and shortcuts on the app icon (New task, Weekly review, Tomorrow’s priorities).',
			'Changes made on another device appear as soon as you come back to the app.',
			'Alerts: if a device cannot sync for 15 minutes, a short alert goes to your ntfy topic (Settings > Alerts).',
			'Saved filters work again, offline too. New app icon.'
		]
	}
];

const KEY = 'news_seen';

export function lastSeen(): string | null {
	try {
		return localStorage.getItem(KEY);
	} catch {
		return null;
	}
}

/** The entries this device has not shown yet (a new device: only the latest one). */
export function unseenNews(seen: string | null = lastSeen()): NewsEntry[] {
	if (!seen) return NEWS.slice(0, 1);
	return NEWS.filter((n) => n.id > seen);
}

export function markNewsSeen(): void {
	try {
		localStorage.setItem(KEY, NEWS[0].id);
	} catch {
		// shown again next time
	}
}

/** Lower case, without accents: "Créé" finds "cree". */
export function fold(s: string): string {
	return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * The updates that mention every word typed (in the title, the date or a line). An entry whose
 * title or date matches keeps all its lines; otherwise only the lines that match are kept.
 */
export function searchNews(query: string, list: NewsEntry[] = NEWS): NewsEntry[] {
	const words = fold(query).split(/\s+/).filter(Boolean);
	if (!words.length) return list;
	const out: NewsEntry[] = [];
	for (const n of list) {
		const head = fold(`${n.date} ${n.title}`);
		const all = fold([n.date, n.title, ...n.items].join(' '));
		if (!words.every((w) => all.includes(w))) continue;
		if (words.every((w) => head.includes(w))) {
			out.push(n);
			continue;
		}
		// Lines that mention at least one word the heading does not.
		const items = n.items.filter((it) => words.some((w) => !head.includes(w) && fold(it).includes(w)));
		out.push({ ...n, items: items.length ? items : n.items });
	}
	return out;
}

/** Splits a text into plain and matching parts, to highlight what was searched. */
export function highlight(text: string, query: string): { t: string; hit: boolean }[] {
	const words = fold(query).split(/\s+/).filter(Boolean);
	if (!words.length) return [{ t: text, hit: false }];
	const f = fold(text);
	// fold() keeps one character per character of an NFC text with accents removed after NFD;
	// map positions back through a per-character fold to stay aligned.
	const chars = [...text];
	const foldedChars = chars.map((c) => fold(c));
	const marks = new Array(chars.length).fill(false);
	const joined = foldedChars.join('');
	if (joined.length === f.length) {
		// index in joined → index in chars
		const owner: number[] = [];
		foldedChars.forEach((fc, i) => {
			for (let k = 0; k < fc.length; k++) owner.push(i);
		});
		for (const w of words) {
			let at = joined.indexOf(w);
			while (at !== -1) {
				for (let k = at; k < at + w.length; k++) marks[owner[k]] = true;
				at = joined.indexOf(w, at + w.length);
			}
		}
	}
	const parts: { t: string; hit: boolean }[] = [];
	chars.forEach((c, i) => {
		const last = parts[parts.length - 1];
		if (last && last.hit === marks[i]) last.t += c;
		else parts.push({ t: c, hit: marks[i] });
	});
	return parts;
}
