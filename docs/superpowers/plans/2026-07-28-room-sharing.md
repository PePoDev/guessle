> Superseded: this is a dated plan kept for history. README.md is the source of truth; later changes include the move from `number-guesser.pepo.dev` to `guessle.pepo.dev` and the Guessle name in invites.

# Online Room Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add copy confirmation, shareable room links, and automatic room-ID prefill for invited players.

**Architecture:** The page reads and validates the `room` query parameter once during initialization, selects Online Multiplayer, and passes the value into the online component. The component owns clipboard/share behavior and temporary accessible tooltips; Firebase state and commands remain unchanged.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Tailwind CSS 4, Vitest, Testing Library, Playwright, Web Share API, Clipboard API

---

## File structure

- Modify `src/routes/+page.svelte` to validate the invite query parameter, select online mode, and pass the initial room ID.
- Modify `src/routes/page.test.ts` to cover valid and invalid invite URLs.
- Modify `src/lib/components/OnlineMultiplayerGame.svelte` to accept the initial room ID and implement copy/share feedback.
- Modify `src/lib/components/OnlineMultiplayerGame.test.ts` to cover prefill, clipboard confirmation, native sharing, fallback sharing, and errors.
- Modify `e2e/online-multiplayer.spec.ts` to prove a second browser can join from the invite URL by entering only a name.
- Modify `README.md` to keep the design contract and change log current.

### Task 1: Invite URL entry flow

**Files:**
- Modify: `src/routes/page.test.ts`
- Modify: `src/lib/components/OnlineMultiplayerGame.test.ts`
- Modify: `e2e/online-multiplayer.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/OnlineMultiplayerGame.svelte`

- [ ] **Step 1: Write failing page tests for valid and invalid invite URLs**

In `src/routes/page.test.ts`, reset the URL in `beforeEach`:

```ts
beforeEach(() => {
	gameStore.reset()
	window.history.replaceState({}, '', '/')
})
```

Add:

```ts
it('selects online mode and pre-fills a valid invite room', async () => {
	window.history.replaceState({}, '', '/?room=ab2c3d')
	render(Page)

	await waitFor(() => {
		expect(screen.getByRole('button', { name: 'Online' })).toHaveAttribute(
			'aria-pressed',
			'true',
		)
	})
	expect(screen.getByLabelText('Room ID')).toHaveValue('AB2C3D')
})

it('ignores an invalid invite room', async () => {
	window.history.replaceState({}, '', '/?room=invalid')
	render(Page)

	await waitFor(() => {
		expect(screen.getByPlaceholderText('Enter number')).toBeInTheDocument()
	})
	expect(screen.queryByLabelText('Room ID')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Write the failing component prefill test**

Add to `src/lib/components/OnlineMultiplayerGame.test.ts`:

```ts
it('pre-fills an invited room without restoring another session', () => {
	const service = createFakeOnlineGameService({
		restoreSessionResult: { uid: 'old-player', roomId: 'ZZZZZZ' },
	})

	render(OnlineMultiplayerGame, {
		props: { service, initialRoomId: 'AB2C3D' },
	})

	expect(screen.getByLabelText('Room ID')).toHaveValue('AB2C3D')
	expect(service.restoreSession).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Change the online E2E flow to use the invite URL**

In the first test in `e2e/online-multiplayer.spec.ts`, keep the host setup, but replace the guest setup and manual room entry:

```ts
await host.goto('/')
await selectOnlineMode(host)

await host.getByLabel('Display name').fill('Ada')
await host.getByRole('button', { name: 'Create Room' }).click()
const roomId = await readRoomId(host)

await guest.goto(`/?room=${roomId}`)
await expect(guest.getByRole('button', { name: 'Online' })).toHaveAttribute(
	'aria-pressed',
	'true',
)
await expect(guest.getByLabel('Room ID')).toHaveValue(roomId)
await guest.getByLabel('Display name').fill('Lin')
await guest.getByRole('button', { name: 'Join Room' }).click()
```

Remove the earlier `guest.goto('/')`, `selectOnlineMode(guest)`, and manual Room ID fill.

- [ ] **Step 4: Run the focused tests and verify they fail for the missing feature**

Run:

```bash
pnpm vitest run src/routes/page.test.ts src/lib/components/OnlineMultiplayerGame.test.ts
```

Expected: FAIL because the page remains in single-player mode and the component does not accept or display `initialRoomId`.

With Java 21 and the local Playwright executable available, run:

```bash
pnpm test:e2e:online
```

Expected: the invite-link test FAILS before the guest reaches the online join form.

- [ ] **Step 5: Implement initial room ID support in the online component**

Update the props and initial form state in `src/lib/components/OnlineMultiplayerGame.svelte`:

```ts
interface Props {
	service?: OnlineGameService
	initialRoomId?: string
}

let {
	service = onlineGameService,
	initialRoomId = '',
}: Props = $props()
let name = $state('')
let roomIdInput = $state(initialRoomId)
```

Prevent an invite from restoring an unrelated saved room:

```ts
$effect(() => {
	if (restoreStarted || initialRoomId || $gameStore.online.roomId) {
		return
	}
	restoreStarted = true
	void service
		.restoreSession()
		.then((session) => {
			if (session) {
				gameStore.setOnlineIdentity(session.uid, session.roomId)
				activeRoomId = session.roomId
			}
		})
		.catch((error: unknown) => {
			reportError(error)
		})
})
```

- [ ] **Step 6: Parse and pass the invite room from the page**

Add page-local state in `src/routes/+page.svelte`:

```ts
let invitedRoomId = $state('')
```

At the start of the existing session-restore effect, normalize and validate the query parameter:

```ts
$effect(() => {
	if (sessionRestoreStarted) {
		return
	}

	sessionRestoreStarted = true
	const roomId =
		new URL(window.location.href).searchParams
			.get('room')
			?.trim()
			.toUpperCase() ?? ''

	if (/^[A-Z2-9]{6}$/.test(roomId)) {
		invitedRoomId = roomId
		gameStore.setMode('online')
		return
	}

	void onlineGameService.restoreSession().then((session) => {
		if (session) {
			gameStore.setMode('online')
			gameStore.setOnlineIdentity(session.uid, session.roomId)
			return
		}

		gameStore.startNewGame()
	}).catch((error: unknown) => {
		gameStore.setMode('online')
		gameStore.setOnlineStatus(
			'error',
			error instanceof Error ? error.message : 'Could not restore the room.',
		)
	})
})
```

Pass the value at the existing render site:

```svelte
<OnlineMultiplayerGame initialRoomId={invitedRoomId} />
```

- [ ] **Step 7: Run focused and online E2E tests**

Run:

```bash
pnpm vitest run src/routes/page.test.ts src/lib/components/OnlineMultiplayerGame.test.ts
pnpm test:e2e:online
```

Expected: page/component tests PASS and all online browser tests PASS, including the invite-link join.

- [ ] **Step 8: Commit**

```bash
git add src/routes/+page.svelte src/routes/page.test.ts src/lib/components/OnlineMultiplayerGame.svelte src/lib/components/OnlineMultiplayerGame.test.ts e2e/online-multiplayer.spec.ts
git commit -m "feat: open online rooms from invite links"
```

### Task 2: Copy confirmation tooltip

**Files:**
- Modify: `src/lib/components/OnlineMultiplayerGame.test.ts`
- Modify: `src/lib/components/OnlineMultiplayerGame.svelte`

- [ ] **Step 1: Write the failing clipboard confirmation test**

Update the Vitest import:

```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
```

Add:

```ts
afterEach(() => {
	vi.useRealTimers()
})

it('copies the room ID and temporarily shows a confirmation tooltip', async () => {
	vi.useFakeTimers()
	const writeText = vi.fn(async () => undefined)
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText },
	})
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	await fireEvent.click(
		screen.getByRole('button', { name: 'Copy Room ID' }),
	)
	await Promise.resolve()

	expect(writeText).toHaveBeenCalledWith('AB2C3D')
	expect(screen.getByRole('status')).toHaveTextContent('Copied!')

	await vi.advanceTimersByTimeAsync(2000)
	await tick()
	expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
})
```

Also import `fireEvent`:

```ts
import {
	fireEvent,
	render,
	screen,
	waitFor,
} from '@testing-library/svelte'
```

- [ ] **Step 2: Write the failing clipboard-error test**

Add:

```ts
it('shows an error when the room ID cannot be copied', async () => {
	const user = userEvent.setup()
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: {
			writeText: vi.fn(async () => {
				throw new Error('Clipboard unavailable.')
			}),
		},
	})
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	await user.click(screen.getByRole('button', { name: 'Copy Room ID' }))

	expect(await screen.findByRole('alert')).toHaveTextContent(
		'Clipboard unavailable.',
	)
})
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```bash
pnpm vitest run src/lib/components/OnlineMultiplayerGame.test.ts
```

Expected: FAIL because no confirmation tooltip is rendered and clipboard errors are unhandled.

- [ ] **Step 4: Implement temporary copy feedback**

Import cleanup support in `OnlineMultiplayerGame.svelte`:

```ts
import { onDestroy } from 'svelte'
```

Add local state:

```ts
let copiedRoomId = $state(false)
let copyStatusTimer: ReturnType<typeof setTimeout> | undefined
```

Replace `copyRoomId`:

```ts
async function copyRoomId() {
	if (!room) {
		return
	}
	try {
		await navigator.clipboard.writeText(room.id)
		copiedRoomId = true
		clearTimeout(copyStatusTimer)
		copyStatusTimer = setTimeout(() => {
			copiedRoomId = false
		}, 2000)
	} catch (error) {
		reportError(error)
	}
}

onDestroy(() => {
	clearTimeout(copyStatusTimer)
})
```

Wrap the lobby button in a positioned container and render an accessible tooltip:

```svelte
<div class="relative">
	<button type="button" onclick={copyRoomId} class="btn-secondary">
		Copy Room ID
	</button>
	{#if copiedRoomId}
		<span
			role="status"
			class="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--glass-border)] bg-[var(--glass-fg)] px-3 py-2 text-sm text-[var(--glass-bg)] shadow-lg"
		>
			Copied!
		</span>
	{/if}
</div>
```

- [ ] **Step 5: Run the focused test**

Run:

```bash
pnpm vitest run src/lib/components/OnlineMultiplayerGame.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/OnlineMultiplayerGame.svelte src/lib/components/OnlineMultiplayerGame.test.ts
git commit -m "feat: confirm copied room IDs"
```

### Task 3: Share action with clipboard fallback

**Files:**
- Modify: `src/lib/components/OnlineMultiplayerGame.test.ts`
- Modify: `src/lib/components/OnlineMultiplayerGame.svelte`

- [ ] **Step 1: Write the failing native-share test**

Add:

```ts
it('shares the room invite URL through the native share sheet', async () => {
	const user = userEvent.setup()
	const share = vi.fn(async () => undefined)
	const writeText = vi.fn(async () => undefined)
	Object.defineProperty(navigator, 'share', {
		configurable: true,
		value: share,
	})
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText },
	})
	window.history.replaceState({}, '', '/')
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	await user.click(screen.getByRole('button', { name: 'Share' }))

	expect(share).toHaveBeenCalledWith({
		title: 'Number Guessing Game',
		text: 'Join my number guessing room AB2C3D.',
		url: `${window.location.origin}/?room=AB2C3D`,
	})
	expect(writeText).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Write failing unavailable and rejected-share fallback tests**

Add:

```ts
it.each([
	['unavailable', undefined],
	[
		'rejected',
		vi.fn(async () => {
			throw new Error('Share cancelled.')
		}),
	],
])('copies the invite link when native sharing is %s', async (_state, share) => {
	const user = userEvent.setup()
	const writeText = vi.fn(async () => undefined)
	Object.defineProperty(navigator, 'share', {
		configurable: true,
		value: share,
	})
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText },
	})
	window.history.replaceState({}, '', '/')
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	await user.click(screen.getByRole('button', { name: 'Share' }))

	expect(writeText).toHaveBeenCalledWith(
		`${window.location.origin}/?room=AB2C3D`,
	)
	expect(screen.getByRole('status')).toHaveTextContent('Link copied!')
})
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```bash
pnpm vitest run src/lib/components/OnlineMultiplayerGame.test.ts
```

Expected: FAIL because the Share button does not exist.

- [ ] **Step 4: Implement URL building, native share, and fallback copy**

Add state:

```ts
let copiedInviteLink = $state(false)
let shareStatusTimer: ReturnType<typeof setTimeout> | undefined
```

Add:

```ts
function roomInviteUrl(roomId: string): string {
	const url = new URL(window.location.href)
	url.searchParams.set('room', roomId)
	return url.toString()
}

function showLinkCopied(): void {
	copiedInviteLink = true
	clearTimeout(shareStatusTimer)
	shareStatusTimer = setTimeout(() => {
		copiedInviteLink = false
	}, 2000)
}

async function copyInviteLink(url: string): Promise<void> {
	await navigator.clipboard.writeText(url)
	showLinkCopied()
}

async function shareRoom() {
	if (!room) {
		return
	}
	const url = roomInviteUrl(room.id)

	try {
		if (navigator.share) {
			await navigator.share({
				title: 'Number Guessing Game',
				text: `Join my number guessing room ${room.id}.`,
				url,
			})
			return
		}
	} catch {}

	try {
		await copyInviteLink(url)
	} catch (error) {
		reportError(error)
	}
}
```

Extend the existing destroy callback:

```ts
onDestroy(() => {
	clearTimeout(copyStatusTimer)
	clearTimeout(shareStatusTimer)
})
```

- [ ] **Step 5: Render Share immediately after Copy Room ID**

Replace the single action wrapper with:

```svelte
<div class="flex flex-wrap items-center gap-2">
	<div class="relative">
		<button type="button" onclick={copyRoomId} class="btn-secondary">
			Copy Room ID
		</button>
		{#if copiedRoomId}
			<span
				role="status"
				class="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--glass-border)] bg-[var(--glass-fg)] px-3 py-2 text-sm text-[var(--glass-bg)] shadow-lg"
			>
				Copied!
			</span>
		{/if}
	</div>
	<div class="relative">
		<button type="button" onclick={shareRoom} class="btn-secondary">
			Share
		</button>
		{#if copiedInviteLink}
			<span
				role="status"
				class="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--glass-border)] bg-[var(--glass-fg)] px-3 py-2 text-sm text-[var(--glass-bg)] shadow-lg"
			>
				Link copied!
			</span>
		{/if}
	</div>
</div>
```

- [ ] **Step 6: Run component tests**

Run:

```bash
pnpm vitest run src/lib/components/OnlineMultiplayerGame.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/OnlineMultiplayerGame.svelte src/lib/components/OnlineMultiplayerGame.test.ts
git commit -m "feat: share online room invite links"
```

### Task 4: Documentation and complete verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the source-of-truth design contract**

Change the Online multiplayer component row in README:

```md
| Online multiplayer | One cream-panel flow: name/create/join entry, room-ID lobby with paired Copy and Share actions, accessible confirmation tooltips, turn/guess state, reconnect status, and host restart |
```

Add after the existing 2026-07-28 decision:

```md
2026-07-28 — Added shareable online-room links that select Online Multiplayer and pre-fill the room ID.
```

- [ ] **Step 2: Run all verification**

Run:

```bash
pnpm check
pnpm test:run
pnpm test:functions
pnpm test:firebase
pnpm test:e2e:online
pnpm test:e2e
pnpm build
git diff --check
```

Expected:

- Svelte check reports zero errors and zero warnings.
- Frontend, Functions, Firebase transaction/rules, online browser, and existing browser tests all pass.
- Production build exits zero.
- `git diff --check` prints nothing.

- [ ] **Step 3: Review scope and forbidden code**

Run:

```bash
git status --short
git diff --stat
rg -n "private_key|client_email|BEGIN PRIVATE KEY|console\\.log|\\bany\\b" . --glob "!node_modules/**" --glob "!pnpm-lock.yaml" --glob "!docs/superpowers/**" --glob "!build/**" --glob "!.svelte-kit/**"
```

Expected: only the room-sharing feature and README are changed; no credentials, `console.log`, or new `any` usage appears.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document online room sharing"
```
