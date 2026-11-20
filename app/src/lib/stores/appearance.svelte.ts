// How the app looks on this device (13 Nov 2026, Lou: "the app could follow the style of my phone's
// apps, a Nothing Phone (3a) in black and white: its colours spoil the point of having made my apps
// black"). Two choices, kept on each device (a phone in black, a computer in light, say):
//   theme  light | black | auto (follows the device: light by day, black when it is set to dark)
//   colour colour | mono (labels and coloured marks in shades of grey)
// "black" is a pure black page with white text and a dot-matrix font for the big titles, in the
// spirit of Nothing's own apps. A web app cannot read a phone's theme or icon pack beyond "light
// or dark", so "auto" is as far as following the device goes. The home-screen icon follows the
// theme (black icon with "black", see setManifest) once the app is added again to the home screen.
export type Theme = 'light' | 'black' | 'auto';
const KEY = 'appearance_v1';

function read(): { theme: Theme; mono: boolean } {
	try {
		const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		return { theme: v.theme === 'black' || v.theme === 'auto' ? v.theme : 'light', mono: v.mono === true };
	} catch {
		return { theme: 'light', mono: false };
	}
}

class Appearance {
	theme = $state<Theme>('light');
	mono = $state(false);
	/** What is shown now (auto resolved). */
	dark = $state(false);
	#media: MediaQueryList | null = null;

	init() {
		if (typeof window === 'undefined') return;
		const v = read();
		this.theme = v.theme;
		this.mono = v.mono;
		this.#media = window.matchMedia('(prefers-color-scheme: dark)');
		this.#media.addEventListener('change', () => this.apply());
		this.apply();
	}
	set(theme: Theme, mono = this.mono) {
		this.theme = theme;
		this.mono = mono;
		try {
			localStorage.setItem(KEY, JSON.stringify({ theme, mono }));
		} catch {
			/* for this visit only */
		}
		this.apply();
	}
	apply() {
		if (typeof document === 'undefined') return;
		this.dark = this.theme === 'black' || (this.theme === 'auto' && !!this.#media?.matches);
		const root = document.documentElement;
		root.dataset.theme = this.dark ? 'black' : 'light';
		if (this.mono) root.dataset.mono = '1';
		else delete root.dataset.mono;
		document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.dark ? '#000000' : '#ffffff');
		setManifest(this.dark);
	}
}

/** The black theme comes with a black icon: the next "Add to home screen" takes it. */
function setManifest(dark: boolean) {
	const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
	if (link) link.href = dark ? '/manifest-black.webmanifest' : '/manifest.webmanifest';
	const touch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
	if (touch) touch.href = dark ? '/icons/apple-touch-icon-black.png' : '/icons/apple-touch-icon.png';
}

export const appearance = new Appearance();
