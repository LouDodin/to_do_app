// The view chosen in the top bar: All, Pro or Perso. It filters the home page, the project tree
// and the right panel. The Inbox is a page of its own since 13 Nov 2026 (/inbox), no longer a view;
// a device that had it saved as its view opens on All.
export type Area = 'all' | 'Pro' | 'Perso';

const KEY = 'view';
const VALID: Area[] = ['all', 'Pro', 'Perso'];

class AreaFilterStore {
	area = $state<Area>('all');
	constructor() {
		try {
			const v = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
			if (v && VALID.includes(v as Area)) this.area = v as Area;
		} catch {
			// storage unavailable
		}
		// A link can choose the view: /?view=all (also pro, perso). /?view=inbox opens the Inbox page
		// (home page, below).
		try {
			const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('view') : null;
			const wanted = q && ({ all: 'all', pro: 'Pro', perso: 'Perso' } as Record<string, Area>)[q.toLowerCase()];
			if (wanted) this.set(wanted);
		} catch {
			// ignore
		}
	}
	set(area: Area) {
		this.area = area;
		try {
			localStorage.setItem(KEY, area);
		} catch {
			// not persisted
		}
	}
}
export const areaFilter = new AreaFilterStore();
