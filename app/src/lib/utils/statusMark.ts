// Which tasks the one-time marking gives the "validated" mark (see db/statusMigration.ts).
import { isInboxProject, REVIEW_LABEL, VALIDATED_LABEL } from './context';
import { isBinProject } from './bin';
import type { VikunjaProject, VikunjaTask } from '../types';

/** Tasks to mark: open, validated the old way, not in the Bin nor an archived project. */
export function tasksToMark(tasks: VikunjaTask[], projects: VikunjaProject[]): VikunjaTask[] {
	const byId = new Map(projects.map((p) => [p.id, p]));
	const has = (t: VikunjaTask, name: string) => (t.labels ?? []).some((l) => l.title.toLowerCase() === name);
	return tasks.filter((t) => {
		const p = byId.get(t.project_id);
		return (
			t.id > 0 &&
			!t.done &&
			!(p && (isBinProject(p) || p.is_archived)) &&
			!isInboxProject(t.project_id, byId) &&
			!has(t, REVIEW_LABEL) &&
			!has(t, VALIDATED_LABEL)
		);
	});
}


/** For app versions older than 19 Oct 2026, still open on some device: they only know the old
 *  flag "ctx:review". Tasks to validate outside the Inbox project must carry it (or those versions
 *  hide them), and validated tasks must not. Returns the label changes to make. */
export function oldFlagFixes(tasks: VikunjaTask[], projects: VikunjaProject[]): { add: VikunjaTask[]; remove: VikunjaTask[] } {
	const byId = new Map(projects.map((p) => [p.id, p]));
	const has = (t: VikunjaTask, name: string) => (t.labels ?? []).some((l) => l.title.toLowerCase() === name);
	const live = tasks.filter((t) => {
		const p = byId.get(t.project_id);
		return t.id > 0 && !t.done && !(p && (isBinProject(p) || p.is_archived));
	});
	return {
		add: live.filter((t) => !has(t, VALIDATED_LABEL) && !has(t, REVIEW_LABEL) && !isInboxProject(t.project_id, byId)),
		remove: live.filter((t) => has(t, VALIDATED_LABEL) && has(t, REVIEW_LABEL))
	};
}
