// The Help centre (the ? button or key, 10 Nov 2026): one window with four tabs, so everything
// about the app itself is in one place: Help, Updates, Status, Settings.
export type HelpTab = 'help' | 'updates' | 'status' | 'settings';
export const HELP_TABS: { id: HelpTab; label: string }[] = [
	{ id: 'help', label: 'Help' },
	{ id: 'updates', label: 'Updates' },
	{ id: 'status', label: 'Status' },
	{ id: 'settings', label: 'Settings' }
];

class HelpStore {
	open = $state(false);
	tab = $state<HelpTab>('help');
	/** Opens the Help centre on a tab (the last one used when none is given). */
	show(tab?: HelpTab) {
		if (tab) this.tab = tab;
		this.open = true;
	}
}
export const helpStore = new HelpStore();
