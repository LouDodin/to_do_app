import type { VikunjaProject } from '../types';

export const BIN_TITLE = 'Bin';
export const BIN_DAYS = 30;

// The Bin is an ordinary (hidden) top-level project on the server, so deleted tasks follow
// the user to every device. It never shows in the tree, the pickers or the merge tools.
export function isBinProject(p: Pick<VikunjaProject, 'title' | 'parent_project_id'>): boolean {
	return (p.title ?? '').trim().toLowerCase() === BIN_TITLE.toLowerCase() && !p.parent_project_id;
}

export function daysLeftInBin(updated: string | undefined, now = Date.now()): number {
	const t = updated ? Date.parse(updated) : NaN;
	if (!Number.isFinite(t)) return BIN_DAYS;
	return Math.max(0, Math.ceil(BIN_DAYS - (now - t) / 86_400_000));
}

export function binExpired(updated: string | undefined, now = Date.now()): boolean {
	const t = updated ? Date.parse(updated) : NaN;
	return Number.isFinite(t) && now - t > BIN_DAYS * 86_400_000;
}
