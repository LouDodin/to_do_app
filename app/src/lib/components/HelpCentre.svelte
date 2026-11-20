<script lang="ts">
	// The Help centre (? button or key): Help, Updates, Status, Settings in one window (10 Nov 2026).
	import Modal from './Modal.svelte';
	import HelpTabs from './HelpTabs.svelte';

	let { onClose }: { onClose: () => void } = $props();
</script>

<Modal title="Help centre" wide tall {onClose}>
	<HelpTabs />
</Modal>
