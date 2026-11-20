// How to install the app, for the browser this page is open in (29 Oct 2026). Only Chrome, Edge
// and Brave can show their own "Install" window from a button in the app; for every other browser
// (Firefox, Samsung Internet, Safari on iPhone, a link opened inside WhatsApp…) Help shows the
// steps instead, so there is always something to tap in "Install the app".

export interface InstallHelp {
	/** What we think this is, shown to the person ("Firefox on Android"). */
	where: string;
	/** Steps, in order. Empty when it cannot be installed from here at all. */
	steps: string[];
	/** A note shown under the steps (or instead of them). */
	note?: string;
}

export function installHelp(ua: string, maxTouchPoints = 0): InstallHelp {
	const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
	const android = /Android/.test(ua);
	// Links opened inside an app (WhatsApp, Instagram, Facebook, Messenger, Gmail…) open in that
	// app's own small browser, which cannot install anything.
	const inApp = /; wv\)|FBAN|FBAV|Instagram|WhatsApp|Line\/|GSA\//.test(ua);

	if (inApp && (android || ios)) {
		return {
			where: 'a page opened inside another app',
			steps: [
				android ? 'Tap the menu ⋮ at the top right of this screen → Open in Chrome (or "Open in browser").' : 'Tap the share or ⋯ button of this screen → Open in Safari.',
				'In the browser, open Help (?) again: the steps for that browser are shown here.'
			],
			note: 'The link was opened inside another app (for example WhatsApp), which cannot install apps.'
		};
	}
	if (ios) {
		if (/CriOS/.test(ua)) return { where: 'Chrome on iPhone', steps: ['Tap the Share button (square with an arrow) at the right of the address bar.', 'Choose "Add to Home Screen", then "Add".'], note: 'Needs iOS 16.4 or later; otherwise open the address in Safari.' };
		if (/EdgiOS/.test(ua)) return { where: 'Edge on iPhone', steps: ['Tap the menu ⋯ at the bottom → Share.', 'Choose "Add to Home Screen", then "Add".'], note: 'Needs iOS 16.4 or later; otherwise open the address in Safari.' };
		if (/FxiOS/.test(ua)) return { where: 'Firefox on iPhone', steps: ['Tap the menu ☰ at the bottom right → Share.', 'Choose "Add to Home Screen", then "Add".'], note: 'If "Add to Home Screen" is not offered, open the address in Safari.' };
		return { where: 'Safari on iPhone / iPad', steps: ['Tap the Share button (square with an arrow) at the bottom of the screen (at the top on an iPad).', 'Scroll down and choose "Add to Home Screen", then "Add".'], note: 'The app then opens from its own icon, like any app.' };
	}
	if (android) {
		if (/Firefox\//.test(ua)) return { where: 'Firefox on Android', steps: ['Tap the menu ⋮ (three dots), at the top right or the bottom right of the screen, next to the address bar.', 'Choose "Install" (or "Add app to Home screen"), then "Add".'] };
		if (/SamsungBrowser/.test(ua)) return { where: 'Samsung Internet', steps: ['Tap the menu ≡ (three lines) at the bottom right.', 'Choose "Add page to" → "Home screen" (or tap the install icon in the address bar), then "Add".'] };
		if (/OPR\/|OPT\//.test(ua)) return { where: 'Opera on Android', steps: ['Tap the menu ⋮ at the top right.', 'Choose "Add to" → "Home screen", then "Add".'] };
		if (/EdgA\//.test(ua)) return { where: 'Edge on Android', steps: ['Tap the menu ≡ (three lines) at the bottom of the screen.', 'Choose "Add to phone" (or "Install"), then "Install".'] };
		return { where: 'Chrome on Android', steps: ['Tap the menu ⋮ (three dots) at the top right of the screen.', 'Choose "Install app" (or "Add to Home screen" → "Install").'], note: 'Brave works the same way.' };
	}
	// Computers
	if (/Firefox\//.test(ua)) return { where: 'Firefox on a computer', steps: [], note: 'Firefox cannot install apps on a computer: the app works fully in this tab (pin it or bookmark it). To get its own window and icon, open the address in Chrome, Edge or Brave.' };
	if (/Edg\//.test(ua)) return { where: 'Edge', steps: ['Click the install icon at the right of the address bar, or menu ⋯ → Apps → "Install this site as an app".'] };
	if (/Chrome\//.test(ua)) return { where: 'Chrome / Brave', steps: ['Click the install icon at the right of the address bar, or menu ⋮ → "Cast, save and share" → "Install page as app".'] };
	if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return { where: 'Safari on a Mac', steps: ['Menu File → "Add to Dock" (macOS 14 Sonoma or later).'] };
	return { where: 'this browser', steps: [], note: 'Open the address in Chrome, Edge or Brave (or Safari on a Mac or an iPhone) to install it.' };
}
