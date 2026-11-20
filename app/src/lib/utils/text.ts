// Task titles start with a capital letter (5 Nov 2026, task "mettre une maj au début des phrases
// automatiquement"). Only the first letter is changed, and nothing when the title starts with a
// web address, an e-mail or a word that is not plain lower case (iPhone, eBay, a code…).
export function capitalizeFirst(title: string): string {
	const m = title.match(/^(\s*)(\S+)/);
	if (!m) return title;
	const word = m[2];
	if (/^(https?:|www\.|[^@\s]+@)/i.test(word)) return title;
	const first = word[0];
	if (first.toLocaleLowerCase() === first.toLocaleUpperCase()) return title; // not a letter (digit, emoji, …)
	if (first !== first.toLocaleLowerCase()) return title; // already a capital
	if (/[A-ZÀ-ÖØ-Þ]/.test(word.slice(1))) return title; // iPhone, eBay: leave as typed
	return m[1] + first.toLocaleUpperCase() + title.slice(m[1].length + 1);
}
