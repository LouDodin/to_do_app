// Which headings of the menu are folded (10 Nov 2026): Projects, Filters, Labels. Remembered on
// each device.
type Section = 'projects' | 'filters' | 'labels';
const KEY = 'menu_folded';

function read(): Section[] {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? '[]');
	} catch {
		return [];
	}
}

class MenuFold {
	folded = $state<Section[]>(typeof localStorage === 'undefined' ? [] : read());
	isOpen(s: Section) {
		return !this.folded.includes(s);
	}
	toggle(s: Section) {
		this.folded = this.isOpen(s) ? [...this.folded, s] : this.folded.filter((x) => x !== s);
		try {
			localStorage.setItem(KEY, JSON.stringify(this.folded));
		} catch {
			// not remembered
		}
	}
}
export const menuFold = new MenuFold();
