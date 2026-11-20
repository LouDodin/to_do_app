// Installable-app plumbing: service worker (app works when the server is off),
// persistent storage (the browser must not evict the offline copy of the tasks),
// and the browser's "install" prompt, offered from Settings.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export const pwa = $state({
	canInstall: false,
	installed: false,
	persisted: null as boolean | null,
	swActive: false,
	updated: false
});

let deferred: InstallEvent | null = null;

export function initPwa() {
	if (typeof window === 'undefined') return;
	pwa.installed =
		window.matchMedia?.('(display-mode: standalone)').matches ||
		window.matchMedia?.('(display-mode: window-controls-overlay)').matches ||
		(navigator as unknown as { standalone?: boolean }).standalone === true;

	window.addEventListener('beforeinstallprompt', (e) => {
		e.preventDefault();
		deferred = e as InstallEvent;
		pwa.canInstall = true;
	});
	window.addEventListener('appinstalled', () => {
		pwa.installed = true;
		pwa.canInstall = false;
		deferred = null;
	});

	if ('serviceWorker' in navigator && !import.meta.env.DEV) {
		const hadController = !!navigator.serviceWorker.controller;
		navigator.serviceWorker
			.register('/sw.js', { scope: '/' })
			.then((reg) => {
				pwa.swActive = true;
				// Look for a new version when the app comes back to the foreground.
				document.addEventListener('visibilitychange', () => {
					if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
				});
			})
			.catch(() => (pwa.swActive = false));
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (hadController) pwa.updated = true;
		});
	}
	startUpdateCheck();

	navigator.storage
		?.persist?.()
		.then((ok) => (pwa.persisted = ok))
		.catch(() => (pwa.persisted = false));
}

export async function promptInstall(): Promise<boolean> {
	if (!deferred) return false;
	await deferred.prompt();
	const { outcome } = await deferred.userChoice;
	deferred = null;
	pwa.canInstall = false;
	return outcome === 'accepted';
}

// Every device runs the latest version (21 Oct 2026). An older version left open on a phone or a
// computer kept the old rules (it hid tasks still to validate). The app compares its build with
// the server's version.txt (at start, when it comes back to the front, every 10 minutes) and, when
// a newer one is there, reloads itself as soon as you are not typing and no window is open (or
// at once if it is in the background). Nothing is lost: changes waiting to be sent are kept.
let newer: string | null = null;
function idle(): boolean {
	const a = document.activeElement as HTMLElement | null;
	const typing = !!a && (['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName) || a.isContentEditable);
	return !typing && !document.querySelector('[role=dialog]');
}
function reloadIfIdle() {
	if (!newer) return;
	let done = '';
	try {
		done = sessionStorage.getItem('reloaded_for') ?? '';
	} catch {
		/* ignore */
	}
	if (done === newer) {
		pwa.updated = true; // already tried once in this session: the banner offers it instead
		return;
	}
	if (document.visibilityState === 'hidden' || idle()) {
		try {
			sessionStorage.setItem('reloaded_for', newer);
		} catch {
			/* ignore */
		}
		location.reload();
	}
}
/** Resolves when no new service worker is still installing or waiting (at most 90 s). */
function workerSettled(reg: ServiceWorkerRegistration): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(resolve, 90_000);
		const check = () => {
			const w = reg.installing ?? reg.waiting;
			if (!w) {
				clearTimeout(timer);
				resolve();
				return;
			}
			w.addEventListener('statechange', check, { once: true });
		};
		check();
	});
}
async function checkVersion() {
	try {
		const res = await fetch(`/version.txt?t=${Date.now()}`, { cache: 'no-store' });
		if (!res.ok) return;
		const v = (await res.text()).trim();
		if (!v || v.slice(0, 16).replace('T', ' ') === __APP_BUILD__) return;
		const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
		await reg?.update().catch(() => undefined);
		// Reload only once the new version is installed on this device. Reloading earlier served the
		// old version again from the device's cache, and the app then gave up until the next day
		// (25 Oct 2026: "App versions" warning for the Mac).
		if (reg) await workerSettled(reg);
		newer = v;
		reloadIfIdle();
	} catch {
		/* offline: next time */
	}
}
function startUpdateCheck() {
	if (import.meta.env.DEV) return;
	setTimeout(() => void checkVersion(), 5000);
	setInterval(() => void checkVersion(), 10 * 60 * 1000);
	setInterval(reloadIfIdle, 30 * 1000);
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') void checkVersion();
		else reloadIfIdle();
	});
}
