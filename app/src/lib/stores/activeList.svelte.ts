// A page can show several TaskList instances at once (home page's blocks,
// for instance). Without this, an arrow-key press with no active selection
// would select index 0 in every visible list simultaneously. Each TaskList
// registers itself here on click/selection so only one list responds to
// keyboard navigation at a time.
let counter = 0;
class ActiveListStore {
	activeId = $state<number | null>(null);
	nextId(): number {
		return ++counter;
	}
	setActive(id: number) {
		this.activeId = id;
	}
}
export const activeList = new ActiveListStore();
