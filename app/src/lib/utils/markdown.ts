// Task descriptions in Markdown (10 Nov 2026). The text is stored as you type it; it is shown
// formatted. Descriptions written in Vikunja's own editor are HTML: shown as they are. Either
// way the result is cleaned (no scripts, no event handlers) and links open in a new tab.
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const looksLikeHtml = (s: string) => /^\s*<(p|div|h[1-6]|ul|ol|blockquote|pre|table|br)\b/i.test(s);

export function renderDescription(text: string | null | undefined): string {
	const src = (text ?? '').trim();
	if (!src) return '';
	const html = looksLikeHtml(src) ? src : (marked.parse(src, { gfm: true, breaks: true, async: false }) as string);
	const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
	// Every link opens in a new tab and doesn't hand this page over to the site.
	return clean.replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ');
}
