<script lang="ts">
	// A start or due date (11 Nov 2026), used everywhere a date is typed or picked: the row's
	// popovers, the phone's long-press menu and the task's page. A day and an optional time, in two
	// boxes: choosing the day is enough, it is saved at once (the time stays as it was, or 09:00 for
	// a start, end of the day for a due date). It is also saved when the box loses the focus or
	// disappears: a click elsewhere that closes the window keeps what was chosen. (The single
	// "date and time" box saved nothing until a time had been typed too.)
	import { onDestroy } from 'svelte';
	import { hasDate } from '../utils/dates';

	let {
		value,
		kind,
		onCommit,
		label = kind === 'due' ? 'Due date' : kind === 'reminder' ? 'Reminder' : 'Start date'
	}: {
		value: string | null | undefined;
		kind: 'start' | 'due' | 'reminder';
		onCommit: (iso: string | null) => void;
		label?: string;
	} = $props();

	const pad = (n: number) => String(n).padStart(2, '0');
	const dayOf = (iso: string | null | undefined) => {
		if (!hasDate(iso)) return '';
		const d = new Date(iso);
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
	};
	const timeOf = (iso: string | null | undefined) => {
		if (!hasDate(iso)) return '';
		const d = new Date(iso);
		return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	};
	const defaultTime = () => (kind === 'due' ? '23:59' : '09:00');

	let day = $state(dayOf(value));
	let time = $state(timeOf(value));
	let focused = $state(false);
	// Shown values follow the task when it changes elsewhere (not while being typed in).
	$effect(() => {
		const v = value;
		if (!focused) {
			day = dayOf(v);
			time = timeOf(v);
		}
	});

	function wanted(): string | null {
		if (!day) return null;
		const d = new Date(`${day}T${time || defaultTime()}`);
		return isNaN(d.getTime()) ? null : d.toISOString();
	}
	function sameMinute(a: string | null, b: string | null | undefined) {
		if (!a || !hasDate(b)) return !a && !hasDate(b);
		return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 60_000;
	}
	function commit() {
		const w = wanted();
		if (!day && !hasDate(value)) return;
		if (sameMinute(w, value)) return;
		if (day && !time) time = defaultTime();
		onCommit(w);
	}
	onDestroy(commit);
</script>

<div
	class="datefield"
	role="group"
	aria-label={label}
	onfocusin={() => (focused = true)}
	onfocusout={(e) => {
		if (e.currentTarget.contains(e.relatedTarget as Node)) return;
		focused = false;
		commit();
	}}
>
	<input class="day" type="date" aria-label={label} bind:value={day} onchange={commit} />
	<input class="time" type="time" aria-label="{label}: time" bind:value={time} onchange={() => day && commit()} disabled={!day} />
</div>

<style>
	.datefield {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.day {
		min-width: 9.5em;
	}
	.time {
		width: 7em;
	}
	/* Phones (15 Nov 2026): the day and the time stay side by side, the time not cut. */
	@media (max-width: 560px) {
		.datefield {
			gap: 0;
			flex-wrap: nowrap;
		}
		/* A tap on the field opens the phone's picker: the small icons only took room. */
		.day::-webkit-calendar-picker-indicator,
		.time::-webkit-calendar-picker-indicator {
			display: none;
		}
		.day,
		.time {
			min-width: 0;
			width: auto;
			padding-left: 4px;
			padding-right: 4px;
		}
	}
	.time:disabled {
		opacity: 0.45;
	}
</style>
