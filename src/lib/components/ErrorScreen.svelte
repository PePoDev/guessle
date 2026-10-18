<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore'
	import { messages } from '$lib/i18n/messages'

	interface Props {
		status: number
	}

	let { status }: Props = $props()
	const t = $derived(messages[$gameStore.locale])
	const copy = $derived(status === 404 ? t.errorPage.notFound : t.errorPage.failed)
</script>

<svelte:head>
	<title>{copy.documentTitle}</title>
</svelte:head>

<div class="stage flex min-h-dvh items-center justify-center p-3 sm:p-5">
	<main class="panel w-full max-w-lg p-4 sm:p-6 md:p-8">
		<p class="font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-tight">
			{t.header.title}<em class="sig">{t.header.titleSignature}</em>
		</p>
		<h1 class="mt-6 font-display text-2xl font-bold">{copy.heading}</h1>
		<p class="mt-2 text-[var(--glass-muted)]">{copy.text}</p>
		<a href="/" class="btn-primary mt-6 inline-flex items-center">{t.errorPage.home}</a>
	</main>
</div>

<style>
	/* The same grid field as the game's stage, so a stray link still lands somewhere familiar. */
	.stage {
		background-color: var(--stage-bg);
		background-image:
			linear-gradient(var(--stage-grid) 1.5px, transparent 1.5px),
			linear-gradient(90deg, var(--stage-grid) 1.5px, transparent 1.5px);
		background-size: 24px 24px;
	}

	@media (min-width: 600px) {
		.stage {
			background-size: 32px 32px;
		}
	}

	.sig {
		font-style: italic;
		font-weight: 700;
		color: var(--glass-accent);
		background: var(--stage-border);
		padding: 0 0.2em;
		border-radius: 0.2em;
	}
</style>
