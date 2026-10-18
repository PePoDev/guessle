> Superseded: this is a dated plan kept for history. README.md is the source of truth; later changes include Guessle (daily) and Random in place of `single`, a Settings gear that always offers language and sound, an icon-only link to `PePoDev/guessle`, and Thai numerals in digit fields.

# Per-Mode Settings, GitHub Stars, and Digit Inputs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move settings into each active game mode, show the repository's live GitHub star count, and filter every game-number input to digits.

**Architecture:** Keep one mode-aware `SettingsModal` and let `+page.svelte` own its trigger and open state. Isolate the GitHub REST request in `GitHubStarLink.svelte`, and centralize digit filtering in one pure store helper consumed by the three game components.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Tailwind CSS 4, Vitest, Testing Library, Playwright, GitHub REST API.

---

## File map

**Create:**

- `src/lib/components/GitHubStarLink.svelte` — best-effort GitHub metadata request and external star link.
- `src/lib/components/GitHubStarLink.test.ts` — success and fallback behavior without network.

**Modify:**

- `src/lib/stores/gameStore.ts` — exported `sanitizeDigits` helper.
- `src/lib/stores/gameStore.test.ts` — helper unit tests.
- `src/lib/components/SinglePlayerGame.svelte` and `.test.ts` — sanitize guesses.
- `src/lib/components/MultiPlayerGame.svelte` and `.test.ts` — sanitize secrets and guesses.
- `src/lib/components/OnlineMultiplayerGame.svelte` and `.test.ts` — sanitize secrets and guesses.
- `src/lib/components/SettingsModal.svelte` and `.test.ts` — fixed active-mode modal.
- `src/routes/+page.svelte` and `page.test.ts` — per-mode Settings trigger, removed Settings nav card, GitHub link.
- `e2e/single-player.spec.ts` — new Settings trigger, digits-only browser coverage, GitHub request stub.
- `e2e/multiplayer.spec.ts` — mode navigation, new Settings trigger, digits-only browser coverage, GitHub request stub.
- `e2e/online-multiplayer.spec.ts` — new Settings trigger, digits-only browser coverage, GitHub request stubs.
- `README.md` — architecture and visual contracts.

---

### Task 1: Add the pure digit sanitizer

**Files:**

- Modify: `src/lib/stores/gameStore.test.ts`
- Modify: `src/lib/stores/gameStore.ts`

- [ ] **Step 1: Write the failing unit tests**

Add `sanitizeDigits` to the test import and add:

```ts
describe('sanitizeDigits', () => {
	it('removes non-digit characters', () => {
		expect(sanitizeDigits('a1-2.3b', 5)).toBe('123')
	})

	it('limits the result without removing leading zeroes', () => {
		expect(sanitizeDigits('001234', 4)).toBe('0012')
	})

	it('handles a pasted mixed value', () => {
		expect(sanitizeDigits(' 0a9\n8 ', 3)).toBe('098')
	})
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm exec vitest run src/lib/stores/gameStore.test.ts
```

Expected: FAIL because `sanitizeDigits` is not exported.

- [ ] **Step 3: Add the minimal helper**

Add beside the existing pure helpers in `gameStore.ts`:

```ts
export function sanitizeDigits(value: string, maxLength: number): string {
	return value.replace(/\D/g, '').slice(0, maxLength)
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run the same focused command. Expected: all store tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/gameStore.ts src/lib/stores/gameStore.test.ts
git commit -m "feat: sanitize numeric game input"
```

---

### Task 2: Filter Single Player guesses

**Files:**

- Modify: `src/lib/components/SinglePlayerGame.test.ts`
- Modify: `src/lib/components/SinglePlayerGame.svelte`

- [ ] **Step 1: Write the failing component test**

Import `fireEvent` from Testing Library and add:

```ts
it('keeps only digits in typed or pasted guesses', async () => {
	render(SinglePlayerGame)
	const input = screen.getByLabelText('Guess')

	await fireEvent.input(input, { target: { value: '0a1-2' } })

	expect(input).toHaveValue('012')
})
```

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm exec vitest run src/lib/components/SinglePlayerGame.test.ts
```

Expected: FAIL because the input still contains non-digits.

- [ ] **Step 3: Implement the input handler**

Import `sanitizeDigits`, add:

```ts
function handleGuessInput(event: Event) {
	const input = event.currentTarget as HTMLInputElement
	guessInput = sanitizeDigits(
		input.value,
		$gameStore.settings.digitCount,
	)
	input.value = guessInput
}
```

Change the guess input from `bind:value={guessInput}` to:

```svelte
value={guessInput}
oninput={handleGuessInput}
inputmode="numeric"
```

Keep its existing `maxlength`, `pattern`, disabled state, keyboard handler, and styles.

- [ ] **Step 4: Run the test and verify GREEN**

Run the focused component test. Expected: all Single Player tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/SinglePlayerGame.svelte src/lib/components/SinglePlayerGame.test.ts
git commit -m "feat: restrict single-player guesses to digits"
```

---

### Task 3: Filter Local Multiplayer secrets and guesses

**Files:**

- Modify: `src/lib/components/MultiPlayerGame.test.ts`
- Modify: `src/lib/components/MultiPlayerGame.svelte`

- [ ] **Step 1: Write failing component tests**

Import `fireEvent` and add one setup-phase and one guessing-phase test:

```ts
it('keeps only digits in local secret numbers', async () => {
	render(MultiPlayerGame)
	const input = screen.getByPlaceholderText('Enter your secret number')

	await fireEvent.input(input, { target: { value: '0a1-2' } })

	expect(input).toHaveValue('012')
})

it('keeps only digits in local guesses', async () => {
	gameStore.savePlayerSetup('Ada', '123')
	gameStore.savePlayerSetup('Lin', '456')
	render(MultiPlayerGame)
	const input = screen.getByLabelText('Guess')

	await fireEvent.input(input, { target: { value: '4x5-6' } })

	expect(input).toHaveValue('456')
})
```

Use the file's existing `beforeEach` initialization so both players and digit count are valid.

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm exec vitest run src/lib/components/MultiPlayerGame.test.ts
```

Expected: both new tests fail with mixed values remaining.

- [ ] **Step 3: Implement both handlers**

Import `sanitizeDigits` and add:

```ts
function handleSecretInput(event: Event) {
	const input = event.currentTarget as HTMLInputElement
	playerNumberInput = sanitizeDigits(
		input.value,
		$gameStore.settings.digitCount,
	)
	input.value = playerNumberInput
}

function handleMultiGuessInput(event: Event) {
	const input = event.currentTarget as HTMLInputElement
	multiGuessInput = sanitizeDigits(
		input.value,
		$gameStore.settings.digitCount,
	)
	input.value = multiGuessInput
}
```

Replace each numeric field's `bind:value` with its `value` and `oninput` pair, and add `inputmode="numeric"` to both. Preserve existing max length, pattern, Enter behavior, and leading-zero padding.

- [ ] **Step 4: Run the test and verify GREEN**

Run the focused Local Multiplayer component suite. Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/MultiPlayerGame.svelte src/lib/components/MultiPlayerGame.test.ts
git commit -m "feat: restrict local multiplayer input to digits"
```

---

### Task 4: Filter Online Multiplayer secrets and guesses

**Files:**

- Modify: `src/lib/components/OnlineMultiplayerGame.test.ts`
- Modify: `src/lib/components/OnlineMultiplayerGame.svelte`

- [ ] **Step 1: Write failing component tests**

Reuse the file's `readyLobbySnapshot` and `guessingSnapshot` helpers:

```ts
it('keeps only digits in online secret numbers', async () => {
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})
	const input = screen.getByLabelText('Secret number')

	await fireEvent.input(input, { target: { value: '0a1-2' } })

	expect(input).toHaveValue('012')
})

it('keeps only digits in online guesses', async () => {
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(
		guessingSnapshot({ currentGuesserUid: 'host' }),
	)
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})
	const input = screen.getByLabelText('Guess')

	await fireEvent.input(input, { target: { value: '4x5-6' } })

	expect(input).toHaveValue('456')
})
```

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm exec vitest run src/lib/components/OnlineMultiplayerGame.test.ts
```

Expected: both tests fail because mixed values remain.

- [ ] **Step 3: Implement both handlers**

Import `sanitizeDigits` and add:

```ts
function handleSecretInput(event: Event) {
	if (!room) {
		return
	}
	const input = event.currentTarget as HTMLInputElement
	secret = sanitizeDigits(input.value, room.digitCount)
	input.value = secret
}

function handleOnlineGuessInput(event: Event) {
	if (!room) {
		return
	}
	const input = event.currentTarget as HTMLInputElement
	guess = sanitizeDigits(input.value, room.digitCount)
	input.value = guess
}
```

Replace the two numeric fields' `bind:value` directives with `value` and `oninput`. Preserve all authoritative room lengths, disabled states, and submit logic.

- [ ] **Step 4: Run the test and verify GREEN**

Run the focused Online Multiplayer component suite. Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/OnlineMultiplayerGame.svelte src/lib/components/OnlineMultiplayerGame.test.ts
git commit -m "feat: restrict online multiplayer input to digits"
```

---

### Task 5: Make SettingsModal mode-aware

**Files:**

- Modify: `src/lib/components/SettingsModal.test.ts`
- Modify: `src/lib/components/SettingsModal.svelte`

- [ ] **Step 1: Replace obsolete mode-selection tests**

Add `GameMode` to the store imports and use:

```ts
function renderSettings(mode: GameMode = 'single') {
	return render(SettingsModal, {
		props: { mode, onclose: mockOnClose },
	})
}
```

Update existing render calls to use `renderSettings()`. Delete the tests that change `Game Mode:` and replace that block with:

```ts
it.each([
	['single', 'Single Player Settings'],
	['multi', 'Local Multiplayer Settings'],
	['online', 'Online Multiplayer Settings'],
] as const)('locks the modal to %s mode', (mode, title) => {
	renderSettings(mode)

	expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
	expect(screen.queryByLabelText('Game Mode:')).not.toBeInTheDocument()
})

it('shows attempts only for Single Player', () => {
	renderSettings('single')

	expect(screen.getByLabelText('Number of Digits:')).toBeInTheDocument()
	expect(screen.getByLabelText('Max Attempts:')).toBeInTheDocument()
	expect(screen.queryByLabelText('Number of Players:')).not.toBeInTheDocument()
})

it.each(['multi', 'online'] as const)(
	'shows player count for %s mode',
	(mode) => {
		renderSettings(mode)

		expect(screen.getByLabelText('Number of Digits:')).toBeInTheDocument()
		expect(screen.getByLabelText('Number of Players:')).toBeInTheDocument()
		expect(screen.queryByLabelText('Max Attempts:')).not.toBeInTheDocument()
	},
)
```

Retain and adapt the existing focus trap, close, persistence, option-list, and restart tests so every render supplies a mode.

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm exec vitest run src/lib/components/SettingsModal.test.ts
```

Expected: FAIL because the component has no `mode` prop, still shows `Game Settings`, and still renders a mode selector.

- [ ] **Step 3: Implement the fixed-mode modal**

Use:

```ts
import {
	gameStore,
	type GameMode,
} from '$lib/stores/gameStore'

interface Props {
	mode: GameMode
	onclose: () => void
}

let { mode, onclose }: Props = $props()

const titles: Record<GameMode, string> = {
	single: 'Single Player Settings',
	multi: 'Local Multiplayer Settings',
	online: 'Online Multiplayer Settings',
}
```

Remove local mode state, `updateGameMode`, and the Game Mode select. Render:

```svelte
<h2 id="settings-title" class="font-display text-2xl font-bold">
	{titles[mode]}
</h2>
```

Keep digit count for all modes, attempts for `single`, and player count for `multi` or `online`. Keep `updateSettings`, focus management, Escape, backdrop click, and close behavior unchanged.

- [ ] **Step 4: Run the test and verify GREEN**

Run the focused SettingsModal suite. Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/SettingsModal.svelte src/lib/components/SettingsModal.test.ts
git commit -m "feat: scope settings to the active mode"
```

---

### Task 6: Move the Settings trigger into the active mode panel

**Files:**

- Modify: `src/routes/page.test.ts`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Write the failing page tests**

Replace global Settings-card assertions with:

```ts
it('opens settings for the active mode from the panel', async () => {
	const user = userEvent.setup()
	render(Page)
	const trigger = screen.getByLabelText('Open Single Player settings')

	expect(
		screen.queryByRole('button', { name: /^04.*Settings/ }),
	).not.toBeInTheDocument()
	await user.click(trigger)

	expect(
		screen.getByRole('heading', { name: 'Single Player Settings' }),
	).toBeInTheDocument()
	expect(trigger).toHaveAttribute('aria-expanded', 'true')
})

it('opens Local Multiplayer settings with only relevant controls', async () => {
	const user = userEvent.setup()
	gameStore.setMode('multi')
	gameStore.startNewGame()
	render(Page)

	await user.click(
		screen.getByLabelText('Open Local Multiplayer settings'),
	)

	expect(
		screen.getByRole('heading', { name: 'Local Multiplayer Settings' }),
	).toBeInTheDocument()
	expect(screen.getByLabelText('Number of Players:')).toBeInTheDocument()
	expect(screen.queryByLabelText('Max Attempts:')).not.toBeInTheDocument()
})

it('hides Online Multiplayer settings after joining a room', async () => {
	gameStore.setMode('online')
	render(Page)
	expect(
		screen.getByLabelText('Open Online Multiplayer settings'),
	).toBeInTheDocument()

	gameStore.applyOnlineSnapshot({
		room: {
			id: 'AB2C3D',
			hostUid: 'host',
			phase: 'lobby',
			digitCount: 3,
			maxPlayers: 2,
			playerOrder: ['host'],
			currentGuesserUid: null,
			winnerUid: null,
			turnNumber: 0,
		},
		players: [],
		guesses: [],
	})

	await waitFor(() => {
		expect(
			screen.queryByLabelText('Open Online Multiplayer settings'),
		).not.toBeInTheDocument()
	})
})
```

Update the existing modal close test to use the active-mode trigger and title.

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm exec vitest run src/routes/page.test.ts
```

Expected: FAIL because Settings still lives in the nav and the modal lacks its required mode.

- [ ] **Step 3: Implement the panel trigger**

In `+page.svelte`:

- Delete the green Settings nav card.
- Keep `showSettings`, `openSettings`, and `closeSettings`.
- Add:

```ts
const canOpenSettings = $derived(
	$gameStore.mode !== 'online' || $gameStore.online.room === null,
)
```

- In the non-instructions header, render a wrapping mode-controls row. Keep the Local/Online segmented control and add:

```svelte
{#if canOpenSettings}
	<button
		type="button"
		class="btn-secondary"
		aria-label={`Open ${modeLabels[$gameStore.mode]} settings`}
		aria-haspopup="dialog"
		aria-expanded={showSettings}
		onclick={openSettings}
	>
		Settings
	</button>
{/if}
```

- Pass the fixed mode:

```svelte
{#if showSettings}
	<SettingsModal mode={$gameStore.mode} onclose={closeSettings} />
{/if}
```

- Preserve the footer's Escape hint because the mode modal still supports Escape.

- [ ] **Step 4: Run focused page and modal tests**

```bash
pnpm exec vitest run src/routes/page.test.ts src/lib/components/SettingsModal.test.ts
```

Expected: both files pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte src/routes/page.test.ts
git commit -m "feat: move settings into game modes"
```

---

### Task 7: Create the GitHub star link

**Files:**

- Create: `src/lib/components/GitHubStarLink.test.ts`
- Create: `src/lib/components/GitHubStarLink.svelte`

- [ ] **Step 1: Write the failing component tests**

Create the test file:

```ts
import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/svelte'
import GitHubStarLink from './GitHubStarLink.svelte'

afterEach(() => {
	vi.unstubAllGlobals()
})

it('shows the functional fallback while stars load', () => {
	vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)))

	render(GitHubStarLink)

	expect(
		screen.getByRole('link', {
			name: 'Open number-guesser on GitHub',
		}),
	).toHaveTextContent('GitHub')
})

it('links to GitHub and shows the fetched star count', async () => {
	const fetchMock = vi.fn(async () => ({
		ok: true,
		json: async () => ({ stargazers_count: 128 }),
	}) as Response)
	vi.stubGlobal('fetch', fetchMock)

	render(GitHubStarLink)

	const link = await screen.findByRole('link', {
		name: 'Open number-guesser on GitHub, 128 stars',
	})
	expect(link).toHaveAttribute(
		'href',
		'https://github.com/PePoDev/number-guesser',
	)
	expect(link).toHaveTextContent('128')
	expect(fetchMock).toHaveBeenCalledWith(
		'https://api.github.com/repos/PePoDev/number-guesser',
		expect.objectContaining({
			headers: expect.objectContaining({
				Accept: 'application/vnd.github+json',
			}),
		}),
	)
})

it.each([
	['request failure', vi.fn(async () => { throw new Error('offline') })],
	[
		'non-success response',
		vi.fn(async () => ({
			ok: false,
			json: async () => ({}),
		}) as Response),
	],
	[
		'malformed response',
		vi.fn(async () => ({
			ok: true,
			json: async () => ({ stargazers_count: 'many' }),
		}) as Response),
	],
])('keeps a functional fallback after %s', async (_case, fetchMock) => {
	vi.stubGlobal('fetch', fetchMock)

	render(GitHubStarLink)

	await waitFor(() => {
		expect(fetchMock).toHaveBeenCalled()
	})
	const link = screen.getByRole('link', {
		name: 'Open number-guesser on GitHub',
	})
	expect(link).toHaveTextContent('GitHub')
	expect(link).not.toHaveTextContent(/\d/)
})
```

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm exec vitest run src/lib/components/GitHubStarLink.test.ts
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the component**

Create:

```svelte
<script lang="ts">
	import { onMount } from 'svelte'

	const repositoryUrl = 'https://github.com/PePoDev/number-guesser'
	const repositoryApiUrl =
		'https://api.github.com/repos/PePoDev/number-guesser'
	let starCount = $state<number | null>(null)
	const accessibleName = $derived(
		starCount === null
			? 'Open number-guesser on GitHub'
			: `Open number-guesser on GitHub, ${starCount} stars`,
	)

	function readStarCount(value: unknown): number | null {
		if (
			typeof value !== 'object' ||
			value === null ||
			!('stargazers_count' in value) ||
			typeof value.stargazers_count !== 'number'
		) {
			return null
		}
		return value.stargazers_count
	}

	onMount(() => {
		let active = true
		void fetch(repositoryApiUrl, {
			headers: {
				Accept: 'application/vnd.github+json',
				'X-GitHub-Api-Version': '2026-03-10',
			},
		})
			.then((response) => {
				if (!response.ok) {
					throw new Error('GitHub request failed.')
				}
				return response.json() as Promise<unknown>
			})
			.then((value) => {
				const count = readStarCount(value)
				if (active && count !== null) {
					starCount = count
				}
			})
			.catch(() => undefined)

		return () => {
			active = false
		}
	})
</script>

<a
	href={repositoryUrl}
	target="_blank"
	rel="noreferrer"
	aria-label={accessibleName}
	class="btn-secondary inline-flex items-center gap-2 whitespace-nowrap"
>
	<span>GitHub</span>
	<svg
		width="18"
		height="18"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.5"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
	</svg>
	{#if starCount !== null}
		<span>{starCount}</span>
	{/if}
</a>
```

- [ ] **Step 4: Run the test and verify GREEN**

Run the focused new component test. Expected: all tests pass without real network traffic.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/GitHubStarLink.svelte src/lib/components/GitHubStarLink.test.ts
git commit -m "feat: show live GitHub stars"
```

---

### Task 8: Place the GitHub link in the panel header

**Files:**

- Modify: `src/routes/page.test.ts`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Write the failing integration test**

Add `afterEach` to Vitest imports. In `beforeEach`, stub a successful GitHub response:

```ts
vi.stubGlobal(
	'fetch',
	vi.fn(async () => ({
		ok: true,
		json: async () => ({ stargazers_count: 128 }),
	}) as Response),
)
```

Add:

```ts
afterEach(() => {
	vi.unstubAllGlobals()
})

it('shows the GitHub star link in the panel header', async () => {
	const { container } = render(Page)

	const link = await screen.findByRole('link', {
		name: 'Open number-guesser on GitHub, 128 stars',
	})
	expect(link).toHaveTextContent('128')
	expect(link.closest('header')).toHaveClass('game-info')
	expect(container.querySelector('nav')).not.toContainElement(link)
})
```

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm exec vitest run src/routes/page.test.ts
```

Expected: FAIL because the GitHub component is not rendered.

- [ ] **Step 3: Integrate the component**

Import `GitHubStarLink`. Wrap the H1 and link in a responsive row inside `game-info`:

```svelte
<div class="flex flex-wrap items-start justify-between gap-3">
	<h1 class="font-display text-[clamp(2rem,4vw,3rem)] font-bold leading-tight">
		Number Guessing <em class="sig">Game.</em>
	</h1>
	<GitHubStarLink />
</div>
```

Keep the link outside the instructions/game branches so it remains available in every mode.

- [ ] **Step 4: Run the integration suites**

```bash
pnpm exec vitest run src/routes/page.test.ts src/lib/components/GitHubStarLink.test.ts
```

Expected: both files pass.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte src/routes/page.test.ts
git commit -m "feat: add GitHub stars to the game panel"
```

---

### Task 9: Update browser flows and prevent test network calls

**Files:**

- Modify: `e2e/single-player.spec.ts`
- Modify: `e2e/multiplayer.spec.ts`
- Modify: `e2e/online-multiplayer.spec.ts`

- [ ] **Step 1: Add browser-level acceptance assertions**

In Single Player, add:

```ts
test('filters non-digits from guesses', async ({ page }) => {
	const input = page.getByLabel('Guess')
	await input.fill('0a1-2')
	await expect(input).toHaveValue('012')
})
```

In Local Multiplayer, add:

```ts
test('filters non-digits from secrets', async ({ page }) => {
	const input = page.getByPlaceholder('Enter your secret number')
	await input.fill('0a1-2')
	await expect(input).toHaveValue('012')
})
```

In the first Online Multiplayer host flow, replace the first host secret fill with:

```ts
await host.getByLabel('Secret number').fill('1a2-3')
await expect(host.getByLabel('Secret number')).toHaveValue('123')
```

- [ ] **Step 2: Stub GitHub in every browser context**

At the top level of Single Player and Local Multiplayer specs, before all describes:

```ts
test.beforeEach(async ({ page }) => {
	await page.route(
		'https://api.github.com/repos/PePoDev/number-guesser',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ stargazers_count: 128 }),
			}),
	)
})
```

In the Online spec, add:

```ts
async function mockGitHubStars(page: Page) {
	await page.route(
		'https://api.github.com/repos/PePoDev/number-guesser',
		(route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ stargazers_count: 128 }),
			}),
	)
}
```

Call `mockGitHubStars` for every page immediately after `newPage()` and before `goto()`. Add the same route in the fixture-page missing-room test before its `goto()`.

- [ ] **Step 3: Migrate Settings selectors**

Single Player:

- Remove the initial Game Mode selection from the main `beforeEach`; Single Player is already the default.
- Replace `button[title="Game Settings"]` with `page.getByLabel('Open Single Player settings')`.
- Remove every `select#game-mode` interaction.

Local Multiplayer:

- Before opening settings, select the Multiplayer nav card:

```ts
await page.getByRole('button', { name: /Multiplayer/ }).click()
await page.getByLabel('Open Local Multiplayer settings').click()
```

- Keep player-count and digit-count selections.
- Remove every `select#game-mode` interaction.

Online Multiplayer:

Replace `selectOnlineMode` with:

```ts
async function selectOnlineMode(page: Page, playerCount = '2') {
	await page.getByRole('button', { name: /Multiplayer/ }).click()
	await page.getByRole('button', { name: 'Online' }).click()
	await page.getByLabel('Open Online Multiplayer settings').click()
	await page.getByLabel('Number of Players:').selectOption(playerCount)
	await page.getByText('Close', { exact: true }).click()
}
```

- [ ] **Step 4: Run browser suites and verify GREEN**

```bash
pnpm exec playwright test e2e/single-player.spec.ts e2e/multiplayer.spec.ts
pnpm test:e2e:online
```

Expected: the acceptance assertions pass because each underlying behavior was already driven through a failing component test, and all local and emulator-backed online flows pass without GitHub network access.

- [ ] **Step 5: Commit**

```bash
git add e2e/single-player.spec.ts e2e/multiplayer.spec.ts e2e/online-multiplayer.spec.ts
git commit -m "test: cover mode settings and numeric inputs"
```

---

### Task 10: Update project guidance and run final verification

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Update the source of truth**

Make these exact documentation changes:

- Architecture: add `GitHubStarLink.svelte` and describe `SettingsModal.svelte` as the mode-specific dialog.
- Stage: describe three numbered nav cards plus the purple New Game action; remove the global Settings-card behavior.
- Components: add the top-right GitHub star link and change Settings modal to a mode-locked contract.
- File map: add `GitHubStarLink.svelte`; update Settings and Stage descriptions.
- Accessibility: state that the count-free GitHub fallback remains an accessible external link.
- Decision log:

```text
2026-07-28 — Moved settings into each game mode, added a best-effort live GitHub star link, and restricted game-number fields to digits.
```

- [ ] **Step 2: Run formatting and forbidden-pattern checks**

```bash
git diff --check
rg -n "console\.log|\bany\b|#[0-9A-Fa-f]{3,8}" src/lib/components/GitHubStarLink.svelte src/lib/components/SinglePlayerGame.svelte src/lib/components/MultiPlayerGame.svelte src/lib/components/OnlineMultiplayerGame.svelte src/lib/components/SettingsModal.svelte src/routes/+page.svelte
```

Expected: no diff errors and no newly introduced forbidden patterns.

- [ ] **Step 3: Run required checks**

```bash
pnpm check
pnpm test:run
pnpm test:e2e
pnpm test:e2e:online
pnpm build
```

Expected:

- `svelte-check` reports 0 errors and 0 warnings.
- All unit/component tests pass.
- All standard and online Playwright tests pass.
- Static production build succeeds.

- [ ] **Step 4: Inspect final scope**

```bash
git status --short
git diff --stat
git diff -- README.md src e2e
```

Confirm only approved UI, tests, and README changes remain.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document mode-specific game controls"
```
