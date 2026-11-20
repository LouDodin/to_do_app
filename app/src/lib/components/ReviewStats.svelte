<script lang="ts">
	// The figures at the top of a review page.
	let { items }: { items: { value: number; label: string; tone?: 'good' | 'warn' | 'bad' }[] } = $props();
</script>

<div class="stats" class:four={items.length > 3} style:--n={items.length}>
	{#each items as it (it.label)}
		<div class="stat {it.tone ?? ''}" class:zero={it.value === 0}>
			<span class="value">{it.value}</span>
			<span class="label">{it.label}</span>
		</div>
	{/each}
</div>

<style>
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 8px;
		margin: 0 0 20px;
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 14px;
		border-radius: var(--radius-lg);
		background: var(--bg-elevated);
	}
	.value {
		font-size: 22px;
		font-weight: 650;
		letter-spacing: -0.02em;
		line-height: 1.2;
	}
	.label {
		font-size: var(--fs-xs);
		color: var(--text-dim);
	}
	.good:not(.zero) .value {
		color: #16a34a;
	}
	.warn:not(.zero) .value {
		color: #d97706;
	}
	.bad:not(.zero) .value {
		color: var(--danger);
	}
	.zero .value {
		color: var(--text-faint);
	}
	@media (max-width: 760px) {
		/* Three figures side by side, four in two rows. */
		.stats {
			grid-template-columns: repeat(var(--n), 1fr);
			gap: 6px;
		}
		.stats.four {
			grid-template-columns: repeat(2, 1fr);
		}
		.stat {
			padding: 8px 10px;
		}
		.value {
			font-size: 19px;
		}
	}
</style>
