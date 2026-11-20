// Phone-sized screen (same breakpoint as the layout's drawers). Components read
// `viewport.phone` to switch to touch-friendly behaviour: tapping a task opens it
// instead of editing in place, label chips are not removable by a stray tap, etc.
export const PHONE_QUERY = '(max-width: 760px)';

export const viewport = $state({ phone: false });

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
	const mq = window.matchMedia(PHONE_QUERY);
	viewport.phone = mq.matches;
	mq.addEventListener?.('change', (e) => (viewport.phone = e.matches));
}
