<script lang="ts">
	import { page } from '$app/state'
	import ErrorScreen from '$lib/components/ErrorScreen.svelte'
</script>

<ErrorScreen status={page.status} />
