<script lang="ts">
	// The "new task" window of the N shortcut and the + button. Since 20 Nov 2026 (Lou #578) it is
	// the full new task window: type a title and press Enter for the Inbox, or fill in the rest
	// (project, dates, reminder, repeat, labels, notes; with a project it skips the Inbox), or 🛒.
	import NewTaskDialog from './NewTaskDialog.svelte';

	let { onClose }: { onClose: () => void } = $props();
</script>

<NewTaskDialog inboxFirst {onClose} />
