// Password managers (Bitwarden, 1Password, LastPass…) offered to fill in the app's own text boxes,
// for example "Add a task to this project…" (5 Nov 2026, task "Bitwarden se propose…"). Every box
// of the app is marked as "not a sign-in field", except on the sign-in page.
const MARKS: [string, string][] = [
	['autocomplete', 'off'],
	['data-bwignore', 'true'],
	['data-1p-ignore', 'true'],
	['data-lpignore', 'true'],
	['data-form-type', 'other']
];

function mark(el: Element) {
	if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
	if (el instanceof HTMLInputElement && el.type === 'password') return;
	if (el.closest('[data-allow-autofill]')) return;
	for (const [k, v] of MARKS) if (el.getAttribute(k) !== v) el.setAttribute(k, v);
}

export function noAutofill(root: HTMLElement = document.body): () => void {
	const all = (n: Element) => {
		mark(n);
		n.querySelectorAll?.('input, textarea').forEach(mark);
	};
	all(root);
	const obs = new MutationObserver((list) => {
		for (const m of list) m.addedNodes.forEach((n) => n instanceof Element && all(n));
	});
	obs.observe(root, { childList: true, subtree: true });
	return () => obs.disconnect();
}
