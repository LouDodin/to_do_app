// Per-list selection + keyboard navigation state, per spec ("Sélection et
// raccourcis clavier sur les listes de tâches"). Each TaskList component
// instance owns its own SelectionStore so multiple blocks on the home page
// don't fight over one selection.

export class SelectionStore {
	selectedId = $state<number | null>(null);

	select(id: number | null) {
		this.selectedId = id;
	}

	moveNext(ids: number[]) {
		if (!ids.length) return;
		const idx = this.selectedId ? ids.indexOf(this.selectedId) : -1;
		this.selectedId = ids[Math.min(idx + 1, ids.length - 1)];
	}

	movePrev(ids: number[]) {
		if (!ids.length) return;
		const idx = this.selectedId ? ids.indexOf(this.selectedId) : 0;
		this.selectedId = ids[Math.max(idx - 1, 0)];
	}

	clear() {
		this.selectedId = null;
	}
}
