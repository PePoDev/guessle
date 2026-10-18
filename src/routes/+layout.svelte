<script lang="ts">
	import '../app.css';
	import { gameStore } from '$lib/stores/gameStore';
	import { detectLocale } from '$lib/i18n/locale';
	import { readSoundSetting } from '$lib/effects/celebrate';

	let { children } = $props();

	gameStore.setLocale(detectLocale());
	gameStore.setSound(readSoundSetting());

	$effect(() => {
		document.documentElement.lang = $gameStore.locale;
	});
</script>

{@render children?.()}
