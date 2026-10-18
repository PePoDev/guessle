<script lang="ts">
	import { onMount, tick, untrack } from 'svelte'
	import { replaceState } from '$app/navigation'
	import { gameStore, keepDigits } from '$lib/stores/gameStore'
	import {
		onlineGameService,
		preloadOnlineBackend,
		type OnlineGameService,
	} from '$lib/services/onlineGameService'
	import { isOnlineErrorCode, type OnlineErrorCode } from '$lib/online/types'
	import { messages } from '$lib/i18n/messages'

	interface Props {
		service?: OnlineGameService
		initialRoomId?: string
	}

	let {
		service = onlineGameService,
		initialRoomId = '',
	}: Props = $props()
	let name = $state('')
	// An invite only pre-fills the field; after that it belongs to the player.
	let roomIdInput = $state(untrack(() => initialRoomId))
	let secret = $state('')
	let guess = $state('')
	let targetChoice = $state('')
	let confirmingForfeit = $state(false)
	let guessField = $state<HTMLInputElement>()
	let heading = $state<HTMLElement>()
	let errorRegion = $state<HTMLElement>()
	// A saved room that could not be reopened waits for the player to retry or
	// forget it, so a restore never fails silently into the entry form.
	let restoreFailed = $state(false)
	// Mirrors IDLE_TURN_SECONDS on the server, which makes the final check.
	const idleTurnMs = 120_000
	let clock = $state(Date.now())
	let turnSeenAt = $state(Date.now())
	let busy = $state(false)
	let copied = $state({ room: false, link: false })
	const copiedTimers: Partial<Record<'room' | 'link', ReturnType<typeof setTimeout>>> = {}
	let activeRoomId = $state($gameStore.online.roomId)
	const t = $derived(messages[$gameStore.locale])
	const room = $derived($gameStore.online.room)
	const currentPlayer = $derived(
		$gameStore.online.players.find(
			(player) => player.uid === $gameStore.online.uid,
		),
	)
	const readyCount = $derived(
		$gameStore.online.players.filter((player) => player.ready).length,
	)
	// The server also requires the host to be ready, so the host is never
	// dropped from their own room at start.
	const canStart = $derived(
		room !== null &&
			room.hostUid === $gameStore.online.uid &&
			currentPlayer?.ready === true &&
			readyCount >= 2,
	)
	const connecting = $derived(busy || $gameStore.online.status === 'connecting')
	const currentGuesser = $derived(
		$gameStore.online.players.find(
			(player) => player.uid === $gameStore.online.room?.currentGuesserUid,
		),
	)
	const activeTargets = $derived(
		$gameStore.online.players.filter(
			(player) =>
				player.uid !== $gameStore.online.uid && !player.eliminated,
		),
	)
	// A choice only counts while that player is still in; with one opponent
	// left there is nothing to choose.
	const targetUid = $derived(
		activeTargets.some((player) => player.uid === targetChoice)
			? targetChoice
			: activeTargets.length === 1
				? activeTargets[0].uid
				: '',
	)
	const guesses = $derived(
		$gameStore.online.guesses.filter(
			(entry) => (entry.match ?? 1) === (room?.match ?? 1),
		),
	)
	const turnKey = $derived(
		room ? `${room.id}:${room.match ?? 1}:${room.turnNumber}` : '',
	)
	const canRemoveIdle = $derived(
		room?.phase === 'guessing' &&
			currentPlayer !== undefined &&
			!currentPlayer.eliminated &&
			room.currentGuesserUid !== $gameStore.online.uid &&
			clock - turnSeenAt >= idleTurnMs,
	)
	const announcement = $derived(
		$gameStore.online.status === 'reconnecting'
			? t.online.reconnecting
			: copied.room
				? t.online.copied
				: copied.link
					? t.online.linkCopied
					: room?.phase === 'lobby' && currentPlayer?.ready
						? t.online.secretReady
						: '',
	)
	const winner = $derived(
		$gameStore.online.players.find(
			(player) => player.uid === $gameStore.online.room?.winnerUid,
		),
	)
	const canGuess = $derived(
		$gameStore.online.room?.phase === 'guessing' &&
			$gameStore.online.room.currentGuesserUid === $gameStore.online.uid,
	)

	function playerName(uid: string | null | undefined): string {
		return (
			$gameStore.online.players.find((player) => player.uid === uid)?.name ??
			t.online.unknownPlayer
		)
	}

	function errorCode(error: unknown, fallback: OnlineErrorCode): OnlineErrorCode {
		return error instanceof Error && isOnlineErrorCode(error.message)
			? error.message
			: fallback
	}

	// A failed command is not retried by itself, so even a lost connection is
	// reported as an error the player can act on rather than as reconnecting.
	function reportError(
		error: unknown,
		fallback: OnlineErrorCode = 'ONLINE_GAME_INTERNAL',
	): void {
		const code = errorCode(error, fallback)
		// A room snapshot proves the backend exists, so an unanswered command
		// inside a room is a lost connection, not a missing backend.
		gameStore.setOnlineStatus(
			'error',
			code === 'ONLINE_UNAVAILABLE' && room ? 'CONNECTION_INTERRUPTED' : code,
		)
	}

	// The control that started a command is disabled while it runs, which drops
	// focus to the page; the error takes it so keyboard and screen-reader users
	// hear what happened and keep their place.
	async function focusError() {
		await tick()
		if ($gameStore.online.error) {
			errorRegion?.focus()
		}
	}

	// Runs one server command at a time and shows any failure as an online error.
	async function act(command: () => Promise<void>): Promise<boolean> {
		busy = true
		try {
			await command()
			return true
		} catch (error) {
			reportError(error)
			await focusError()
			return false
		} finally {
			busy = false
		}
	}

	function enterRoom(enter: () => Promise<{ uid: string; roomId: string }>) {
		gameStore.setOnlineStatus('connecting')
		restoreFailed = false
		return act(async () => {
			const session = await enter()
			gameStore.setOnlineIdentity(session.uid, session.roomId)
			activeRoomId = session.roomId
			forgetInvite()
		})
	}

	// Once joined, the saved session is the way back in; a lingering ?room=
	// would send a refresh to the join form instead.
	function forgetInvite() {
		const url = new URL(window.location.href)
		if (!url.searchParams.has('room')) {
			return
		}
		url.searchParams.delete('room')
		replaceState(url, {})
	}

	const createRoom = () =>
		enterRoom(() =>
			service.createRoom({
				name,
				digitCount: $gameStore.settings.digitCount,
				maxPlayers: $gameStore.settings.playerCount,
			}),
		)

	const joinRoom = () =>
		enterRoom(() =>
			service.joinRoom({ name, roomId: roomIdInput.trim().toUpperCase() }),
		)

	const setSecret = () =>
		act(async () => {
			await service.setSecret({ roomId: $gameStore.online.roomId, number: secret })
			secret = ''
		})

	const startRoom = () => room && act(() => service.startRoom(room.id))

	const restartRoom = () => room && act(() => service.restartRoom(room.id))

	const removeIdlePlayer = () =>
		room &&
		act(() =>
			service.removeIdlePlayer({ roomId: room.id, turnNumber: room.turnNumber }),
		)

	const leaveRoom = () =>
		room &&
		act(async () => {
			await service.leaveRoom(room.id)
			activeRoomId = ''
			confirmingForfeit = false
			gameStore.clearOnlineSession()
		})

	function chooseTarget(event: Event) {
		targetChoice = (event.currentTarget as HTMLSelectElement).value
	}

	async function submitGuess() {
		if (!room || !targetUid) {
			return
		}
		const { id: roomId, turnNumber } = room
		const submitted = await act(async () => {
			await service.submitGuess({ roomId, targetUid, guess, turnNumber })
			guess = ''
		})
		if (!submitted) {
			return
		}
		await tick()
		if (canGuess) {
			guessField?.focus()
		} else if (document.activeElement === document.body) {
			heading?.focus()
		}
	}

	function handleGuessSubmit(event: SubmitEvent) {
		event.preventDefault()
		void submitGuess()
	}

	async function copy(kind: 'room' | 'link', text: string) {
		await navigator.clipboard.writeText(text)
		copied[kind] = true
		clearTimeout(copiedTimers[kind])
		copiedTimers[kind] = setTimeout(() => {
			copied[kind] = false
		}, 2000)
	}

	async function copyRoomId() {
		if (!room) {
			return
		}
		try {
			await copy('room', room.id)
		} catch (error) {
			reportError(error, 'CLIPBOARD_FAILED')
		}
	}

	async function shareRoom() {
		if (!room) {
			return
		}
		const url = new URL(window.location.href)
		url.search = ''
		url.hash = ''
		url.searchParams.set('room', room.id)
		try {
			if (navigator.share) {
				await navigator.share({
					title: t.title,
					text: t.online.shareText(room.id),
					url: url.toString(),
				})
				return
			}
		} catch {}
		try {
			await copy('link', url.toString())
		} catch (error) {
			reportError(error, 'CLIPBOARD_FAILED')
		}
	}

	async function restoreRoom(): Promise<boolean> {
		try {
			const session = await service.restoreSession()
			restoreFailed = false
			if (session) {
				gameStore.setOnlineIdentity(session.uid, session.roomId)
				activeRoomId = session.roomId
			}
			return true
		} catch {
			restoreFailed = true
			gameStore.setOnlineStatus('error', 'RESTORE_FAILED')
			return false
		}
	}

	async function retryRestore() {
		busy = true
		// Clears the old error; a restored session sets its own status.
		gameStore.setOnlineStatus('idle')
		const restored = await restoreRoom()
		busy = false
		if (!restored) {
			await focusError()
		}
	}

	async function forgetRoom() {
		service.clearSession()
		gameStore.clearOnlineSession()
		restoreFailed = false
		await tick()
		heading?.focus()
	}

	onMount(() => {
		if (service === onlineGameService) {
			preloadOnlineBackend()
		}
		if (!initialRoomId && !$gameStore.online.roomId) {
			void restoreRoom()
		}
		const timer = setInterval(() => {
			clock = Date.now()
		}, 5000)
		return () => {
			clearInterval(timer)
			clearTimeout(copiedTimers.room)
			clearTimeout(copiedTimers.link)
		}
	})

	$effect(() => {
		void turnKey
		untrack(() => {
			turnSeenAt = Date.now()
			clock = turnSeenAt
			confirmingForfeit = false
		})
	})

	// When a new screen replaces the focused control, focus its heading so
	// keyboard and screen-reader users land in the new content.
	let lastPhaseKey: string | null = null
	const phaseKey = $derived(room ? `${room.id}:${room.phase}` : 'entry')
	$effect(() => {
		const key = phaseKey
		const changed = lastPhaseKey !== null && lastPhaseKey !== key
		lastPhaseKey = key
		if (!changed) {
			return
		}
		void tick().then(() => {
			if (!document.activeElement || document.activeElement === document.body) {
				heading?.focus()
			}
		})
	})

	$effect(() => {
		const roomId = activeRoomId
		if (!roomId) {
			return
		}
		return service.subscribeToRoom(
			roomId,
			(snapshot) => gameStore.applyOnlineSnapshot(snapshot),
			(code) => {
				if (code === 'ROOM_NOT_FOUND') {
					service.clearSession()
					activeRoomId = ''
					gameStore.clearOnlineSession()
					gameStore.setOnlineStatus('error', code)
					return
				}
				gameStore.setOnlineStatus('reconnecting')
			},
		)
	})
</script>

{#snippet tooltip(show: boolean, text: string)}
	{#if show}
		<span aria-hidden="true" class="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--glass-border)] bg-[var(--glass-fg)] px-3 py-2 text-sm text-[var(--glass-bg)] shadow-lg">{text}</span>
	{/if}
{/snippet}

<!-- Live regions stay mounted so screen readers announce every change. -->
<div role="alert" tabindex="-1" bind:this={errorRegion}>
	{#if $gameStore.online.error}
		<p class="banner banner-incorrect mb-4">
			{t.online.errors[$gameStore.online.error]}
		</p>
	{/if}
</div>
<p class="sr-only" role="status">{announcement}</p>

{#if $gameStore.online.status === 'reconnecting'}
	<p class="banner banner-warning mb-4">
		{t.online.reconnecting}
	</p>
{/if}

{#if !room && restoreFailed}
	<section
		aria-labelledby="online-restore-heading"
		class="space-y-5 text-[var(--glass-fg)]"
	>
		<div>
			<p class="eyebrow">
				{t.modes.online}
			</p>
			<h2 id="online-restore-heading" bind:this={heading} tabindex="-1" class="font-display text-2xl font-bold">
				{t.online.restoreHeading}
			</h2>
		</div>
		<p aria-live="polite" class="text-sm text-[var(--glass-muted)]">
			{connecting ? t.online.connecting : t.online.restoreHint}
		</p>
		<div class="flex flex-wrap gap-3">
			<button type="button" onclick={retryRestore} disabled={busy} class="btn-primary">
				{t.online.tryAgain}
			</button>
			<button type="button" onclick={forgetRoom} disabled={busy} class="btn-secondary">
				{t.online.forgetRoom}
			</button>
		</div>
	</section>
{:else if !room}
	<section
		aria-labelledby="online-entry-heading"
		class="space-y-5 text-[var(--glass-fg)]"
	>
		<div>
			<p class="eyebrow">
				{t.modes.online}
			</p>
			<h2 id="online-entry-heading" bind:this={heading} tabindex="-1" class="font-display text-2xl font-bold">
				{t.online.entryHeading}
			</h2>
		</div>

		<label class="block space-y-2">
			<span>{t.online.displayName}</span>
			<input
				bind:value={name}
				disabled={busy}
				maxlength="20"
				class="field-input w-full text-left"
			/>
		</label>

		<div class="grid gap-3 sm:grid-cols-2">
			<button
				type="button"
				onclick={createRoom}
				disabled={connecting || !name.trim()}
				class="btn-primary"
			>
				{t.online.createRoom}
			</button>
			<div class="space-y-2">
				<label class="block space-y-2">
					<span>{t.online.roomId}</span>
					<input
						bind:value={roomIdInput}
						disabled={busy}
						maxlength="6"
						class="field-input w-full uppercase"
					/>
				</label>
				<button
					type="button"
					onclick={joinRoom}
					disabled={connecting || !name.trim() || roomIdInput.trim().length !== 6}
					class="btn-primary w-full"
				>
					{t.online.joinRoom}
				</button>
			</div>
		</div>
		<p aria-live="polite" class="text-sm text-[var(--glass-muted)]">
			{connecting ? t.online.connecting : t.online.entryHint}
		</p>
	</section>
{:else if room.phase === 'lobby'}
	<section
		aria-labelledby="online-lobby-heading"
		class="space-y-5 text-[var(--glass-fg)]"
	>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<p class="eyebrow">
					{t.online.lobby}
				</p>
				<h2 id="online-lobby-heading" bind:this={heading} tabindex="-1" class="font-display text-2xl font-bold">
					{t.online.room} <span data-testid="room-id">{room.id}</span>
				</h2>
			</div>
			<div class="flex flex-wrap gap-2">
				<div class="relative">
					{@render tooltip(copied.room, t.online.copied)}
					<button type="button" onclick={copyRoomId} class="btn-secondary">
						{t.online.copyRoomId}
					</button>
				</div>
				<div class="relative">
					{@render tooltip(copied.link, t.online.linkCopied)}
					<button type="button" onclick={shareRoom} class="btn-secondary">
						{t.online.share}
					</button>
				</div>
			</div>
		</div>

		<p>{t.online.playerCount($gameStore.online.players.length, room.maxPlayers)}</p>
		<ul class="space-y-2">
			{#each $gameStore.online.players as player (player.uid)}
				<li class="history-row flex items-center justify-between px-3 py-2">
					<span>
						{player.name}
						{#if player.uid === room.hostUid}
							<small>{t.online.host}</small>
						{/if}
					</span>
					<span>{player.ready ? t.online.ready : t.online.waiting}</span>
				</li>
			{/each}
		</ul>

		{#if currentPlayer}
			<label class="block space-y-2">
				<span>{t.online.secretLabel}</span>
				<input
					value={secret}
					oninput={(event) => (secret = keepDigits(event, room.digitCount))}
					disabled={busy}
					inputmode="numeric"
					class="field-input w-full"
				/>
			</label>
			<button
				type="button"
				onclick={setSecret}
				disabled={busy || secret.length !== room.digitCount}
				class="btn-primary"
			>
				{currentPlayer.ready ? t.online.updateSecret : t.online.markReady}
			</button>
			{#if currentPlayer.ready}
				<p>{t.online.secretReady}</p>
			{/if}
		{/if}

		<div class="flex flex-wrap gap-3">
			{#if room.hostUid === $gameStore.online.uid}
				<button
					type="button"
					onclick={startRoom}
					disabled={busy || !canStart}
					class="btn-primary"
				>
					{t.online.startGame}
				</button>
			{/if}
			{#if canStart && readyCount < $gameStore.online.players.length}
				<p class="w-full text-sm text-[var(--glass-muted)]">{t.online.startHint}</p>
			{/if}
			<button
				type="button"
				onclick={leaveRoom}
				disabled={busy}
				class="btn-secondary"
			>
				{t.online.leaveRoom}
			</button>
		</div>
	</section>
{:else if room.phase === 'guessing'}
	<section
		aria-labelledby="online-game-heading"
		class="space-y-5 text-[var(--glass-fg)]"
	>
		<div>
			<p class="eyebrow">
				{t.online.roomLabel(room.id)}
			</p>
			<h2 id="online-game-heading" bind:this={heading} tabindex="-1" aria-live="polite" class="font-display text-2xl font-bold">
				{t.online.turn(currentGuesser?.name ?? t.online.unknownPlayer)}
			</h2>
		</div>

		<ul class="grid gap-2 sm:grid-cols-2">
			{#each $gameStore.online.players as player (player.uid)}
				<li
					class="history-row px-3 py-2 {player.eliminated ? 'history-row-eliminated' : ''}"
				>
					<strong>{player.name}</strong>
					<span class="ml-2">
						{player.left
							? t.online.left
							: player.eliminated
								? t.online.eliminated
								: t.online.active}
					</span>
				</li>
			{/each}
		</ul>

		<form class="space-y-5" onsubmit={handleGuessSubmit}>
			<label class="block space-y-2">
				<span>{t.online.targetLabel}</span>
				<select
					value={targetUid}
					onchange={chooseTarget}
					disabled={!canGuess || busy}
					class="field-select w-full"
				>
					{#if activeTargets.length !== 1}
						<option value="">{t.online.choosePlayer}</option>
					{/if}
					{#each activeTargets as player (player.uid)}
						<option value={player.uid}>{player.name}</option>
					{/each}
				</select>
			</label>
			<label class="block space-y-2">
				<span>{t.online.guessLabel}</span>
				<input
					bind:this={guessField}
					value={guess}
					oninput={(event) => (guess = keepDigits(event, room.digitCount))}
					disabled={!canGuess || busy}
					inputmode="numeric"
					class="field-input w-full"
				/>
			</label>
			<button
				type="submit"
				disabled={!canGuess ||
					busy ||
					!targetUid ||
					guess.length !== room.digitCount}
				class="btn-primary"
			>
				{t.online.submit}
			</button>
		</form>

		{#if canRemoveIdle && currentGuesser}
			<div class="banner banner-warning space-y-3">
				<p>{t.online.idleHint(currentGuesser.name)}</p>
				<button type="button" class="btn-secondary" disabled={busy} onclick={removeIdlePlayer}>
					{t.online.removeIdle(currentGuesser.name)}
				</button>
			</div>
		{/if}

		{#if confirmingForfeit}
			<div class="banner banner-warning space-y-3">
				<p>{t.online.forfeitConfirm}</p>
				<div class="flex flex-wrap gap-3">
					<button type="button" class="btn-primary" disabled={busy} onclick={leaveRoom}>
						{t.online.forfeit}
					</button>
					<button type="button" class="btn-secondary" onclick={() => (confirmingForfeit = false)}>
						{t.online.keepPlaying}
					</button>
				</div>
			</div>
		{:else}
			<button
				type="button"
				class="btn-secondary"
				disabled={busy}
				onclick={() => (currentPlayer?.eliminated ? leaveRoom() : (confirmingForfeit = true))}
			>
				{currentPlayer?.eliminated ? t.online.leaveRoom : t.online.leaveGame}
			</button>
		{/if}

		<h3 class="font-display text-lg font-bold">{t.online.historyHeading}</h3>
		{#if guesses.length === 0}
			<p class="text-[var(--glass-muted)]">{t.online.historyEmpty}</p>
		{:else}
			<ol class="space-y-2">
				{#each guesses as entry, index (entry.id)}
					<li class="history-row px-3 py-2 {index === guesses.length - 1 ? 'history-row-newest' : ''}">
						<strong>{playerName(entry.guesserUid)}</strong>{t.online.historyEntry(
							entry.guess,
							playerName(entry.targetUid),
							entry.correctDigits,
							entry.correctPositions,
						)}
					</li>
				{/each}
			</ol>
		{/if}
	</section>
{:else}
	<section
		aria-labelledby="online-finished-heading"
		class="space-y-5 text-[var(--glass-fg)]"
	>
		<p class="eyebrow">
			{t.online.roomLabel(room.id)}
		</p>
		<h2 id="online-finished-heading" bind:this={heading} tabindex="-1" class="font-display text-2xl font-bold">
			{t.online.wins(winner?.name ?? t.online.unknownPlayer)}
		</h2>
		{#if room.hostUid === $gameStore.online.uid}
			<button
				type="button"
				onclick={restartRoom}
				disabled={busy}
				class="btn-primary"
			>
				{t.online.playAgain}
			</button>
		{:else}
			<p aria-live="polite">{t.online.waitingForHost}</p>
		{/if}
		<button
			type="button"
			onclick={leaveRoom}
			disabled={busy}
			class="btn-secondary"
		>
			{t.online.leaveRoom}
		</button>
	</section>
{/if}
