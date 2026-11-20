import { DEFAULT_COLOR_ORDER } from '../utils/labelSort';

const STORAGE_KEY = 'app_settings_v1';

interface Settings {
	colorOrder: string[];
	// Error-notification channel is a Mac-side automation concern per the
	// spec's final decision (macOS-only) — kept here only as a placeholder
	// toggle for a future in-app banner, not wired to anything yet.
	errorBannerEnabled: boolean;
	filterOrder: number[];
}

function loadInitial(): Settings {
	if (typeof localStorage === 'undefined') {
		return { colorOrder: [...DEFAULT_COLOR_ORDER], errorBannerEnabled: true, filterOrder: [] };
	}
	const raw = localStorage.getItem(STORAGE_KEY);
	if (!raw) return { colorOrder: [...DEFAULT_COLOR_ORDER], errorBannerEnabled: true, filterOrder: [] };
	try {
		const parsed = JSON.parse(raw);
		return {
			colorOrder: Array.isArray(parsed.colorOrder) ? parsed.colorOrder : [...DEFAULT_COLOR_ORDER],
			errorBannerEnabled: parsed.errorBannerEnabled ?? true,
			filterOrder: Array.isArray(parsed.filterOrder) ? parsed.filterOrder : []
		};
	} catch {
		return { colorOrder: [...DEFAULT_COLOR_ORDER], errorBannerEnabled: true, filterOrder: [] };
	}
}

class SettingsStore {
	colorOrder = $state<string[]>(loadInitial().colorOrder);
	errorBannerEnabled = $state<boolean>(loadInitial().errorBannerEnabled);
	filterOrder = $state<number[]>(loadInitial().filterOrder);

	setFilterOrder(ids: number[]) {
		this.filterOrder = ids;
		this.persist();
	}

	persist() {
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ colorOrder: this.colorOrder, errorBannerEnabled: this.errorBannerEnabled, filterOrder: this.filterOrder })
		);
	}

	setColorOrder(order: string[]) {
		this.colorOrder = order;
		this.persist();
	}

	moveColor(index: number, direction: -1 | 1) {
		const next = [...this.colorOrder];
		const target = index + direction;
		if (target < 0 || target >= next.length) return;
		[next[index], next[target]] = [next[target], next[index]];
		this.setColorOrder(next);
	}
}

export const settings = new SettingsStore();
