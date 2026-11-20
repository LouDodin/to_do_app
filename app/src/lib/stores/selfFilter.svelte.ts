// The home page's filter. Not remembered: the home page always opens on Today, Red and Available,
// with an empty filter box (25 Oct 2026).
import { EMPTY_FILTER, type SelfFilter } from '../utils/selfFilter';

class SelfFilterStore {
	value = $state<SelfFilter>({ ...EMPTY_FILTER });
	update(patch: Partial<SelfFilter>) {
		this.value = { ...this.value, ...patch };
	}
	clear() {
		this.update({ ...EMPTY_FILTER });
	}
}
export const selfFilter = new SelfFilterStore();
