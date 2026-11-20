// Vikunja represents "no date" as the Go zero time ("0001-01-01T00:00:00Z"),
// not null, so a plain truthiness check treats an empty date as real.
export function hasDate(iso?: string | null): iso is string {
	if (!iso) return false;
	const d = new Date(iso);
	return !isNaN(d.getTime()) && d.getFullYear() > 1900;
}

export function toDatetimeLocal(iso?: string | null): string {
	if (!hasDate(iso)) return '';
	const d = new Date(iso);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// End of day, `offsetDays` from today — day-level quick picks shouldn't
// make a task instantly overdue.
export function endOfDayIso(offsetDays: number): string {
	const d = new Date();
	d.setDate(d.getDate() + offsetDays);
	d.setHours(23, 59, 0, 0);
	return d.toISOString();
}
