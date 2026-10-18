> Superseded: this is a dated plan kept for history. README.md is the source of truth; later changes include an Online nav card with a Local/Online switch, starting once at least two players are ready, forfeiting on leave, removing idle players, Functions in `asia-southeast1` configured from repository secrets, Guessle (daily) and Random in place of `single`, and no New Game button.

# Firebase Online Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure Firebase-backed online rooms for two to four players while preserving single-player and local multiplayer.

**Architecture:** The SvelteKit client authenticates anonymously, invokes callable Cloud Functions for every authoritative command, and subscribes to member-only Firestore projections. Cloud Functions store secrets in a client-inaccessible collection and use transactions for room capacity, readiness, turns, feedback, elimination, and winners.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Firebase Web SDK, Firebase Auth, Cloud Firestore, Cloud Functions v2, Firebase Admin SDK, Firebase Emulator Suite, Vitest, Testing Library, Playwright, GitHub Actions.

---

## File map

### Firebase project and tooling

- Create `pnpm-workspace.yaml` — include the Functions package in the root lockfile.
- Modify `package.json` — add Firebase/emulator scripts and client dependencies.
- Modify `.gitignore` — ignore generated Firebase state and Functions output.
- Create `.env.example` — document production public Firebase variables.
- Create `firebase.json` — Functions, Firestore, and emulator configuration.
- Create `firestore.rules` — member-only reads and server-only writes.
- Create `firestore.indexes.json` — checked-in Firestore index configuration.

### Cloud Functions

- Create `functions/package.json` — deployable Functions package.
- Create `functions/tsconfig.json` — strict TypeScript build.
- Create `functions/vitest.config.ts` — Node test environment.
- Create `vitest.firebase.config.ts` — isolated Node configuration for security-rule tests.
- Modify `vitest.config.ts` — exclude emulator-only security-rule tests from ordinary unit runs.
- Create `functions/src/domain.ts` — pure validation, feedback, and turn resolution.
- Create `functions/src/domain.test.ts` — pure rule coverage.
- Create `functions/src/errors.ts` — stable domain-to-callable error mapping.
- Create `functions/src/firestore.ts` — Admin initialization, paths, and public/private Firestore types.
- Create `functions/src/roomCommands.ts` — create, join, secret, start, leave, and restart commands.
- Create `functions/src/roomCommands.test.ts` — emulator-backed room lifecycle coverage.
- Create `functions/src/guessCommand.ts` — transactional authoritative guess command.
- Create `functions/src/guessCommand.test.ts` — emulator-backed turn and race coverage.
- Create `functions/src/cleanup.ts` — scheduled recursive deletion.
- Create `functions/src/cleanup.test.ts` — expiration coverage.
- Create `functions/src/index.ts` — callable and scheduled Function exports.

### Web client

- Create `src/lib/online/types.ts` — public online room, player, guess, snapshot, and status types.
- Create `src/lib/firebase/client.ts` — lazy Firebase browser initialization and emulator connection.
- Create `src/lib/services/onlineGameService.ts` — auth, commands, subscriptions, persistence, decoders, and error mapping.
- Create `src/lib/services/onlineGameService.test.ts` — service behavior with mocked SDK boundaries.
- Modify `src/lib/stores/gameStore.ts:3-189` — add `online` mode and the sole shared online state/actions.
- Modify `src/lib/stores/gameStore.test.ts:10-297` — online state transition coverage.
- Create `src/lib/components/OnlineMultiplayerGame.svelte` — entry, lobby, guessing, reconnecting, and finished UI.
- Create `src/lib/components/OnlineMultiplayerGame.test.ts` — component behavior with a fake service.
- Modify `src/lib/components/SettingsModal.svelte:10-105` — third mode and online room settings.
- Modify `src/lib/components/SettingsModal.test.ts:46-193` — online mode selection tests.
- Modify `src/routes/+page.svelte:3-69` — render online mode and suppress local New Game behavior.
- Modify `src/routes/page.test.ts:58-145` — online route integration coverage.
- Modify `src/app.css` — define the already documented design tokens used by the new surface.

### Security, end-to-end, delivery, and docs

- Create `src/lib/firebase/firestore.rules.test.ts` — emulator-backed rule tests.
- Create `e2e/online-multiplayer.spec.ts` — multiple browser-context room flow.
- Modify `playwright.config.ts` — run the test-mode Vite configuration.
- Modify `.github/workflows/deploy.yml:37-63` — inject public Firebase build variables.
- Create `.github/workflows/deploy-firebase.yml` — test and deploy Functions/rules/indexes.
- Modify `README.md:9-315` — online behavior, setup, architecture, tests, design file map, deployment, and decision log.

---

### Task 1: Scaffold the Firebase workspace and emulator configuration

**Files:**
- Modify: `README.md`
- Create: `pnpm-workspace.yaml`
- Modify: `package.json:6-34`
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `firebase.json`
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/vitest.config.ts`
- Create: `vitest.firebase.config.ts`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Record the approved architecture and add the workspace dependencies**

Before changing code, update the compact README:

- Add **Online multiplayer** under Modes: two to four players, display names,
  create/join by six-character room ID, private secrets, refresh reconnect, and
  server-authoritative turns.
- Add Firebase Web SDK, Anonymous Auth, Firestore, callable Functions, Admin
  SDK, and Emulator Suite to Stack; replace “There is no server” with the
  client/Functions/Firestore boundary.
- Extend Architecture with `functions/`, `firebase.json`, `firestore.rules`,
  `src/lib/firebase/`, `src/lib/online/`, and `src/lib/services/`.
- Add binding rules that secrets never enter public Firestore or client state,
  production Firebase is forbidden in tests, and Vite `test` mode uses only
  the checked-in `demo-number-guessing` identifiers.
- Note that Firebase dependencies and deployment changes were explicitly
  approved for this feature.

Run:

```bash
pnpm add firebase
pnpm add -D firebase-tools @firebase/rules-unit-testing
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - functions
```

Create `functions/package.json`:

```json
{
  "name": "number-guessing-functions",
  "private": true,
  "type": "module",
  "main": "lib/index.js",
  "engines": {
    "node": "20"
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run src/domain.test.ts",
    "test:emulator": "vitest run src/roomCommands.test.ts src/guessCommand.test.ts src/cleanup.test.ts",
    "test:watch": "vitest"
  },
  "dependencies": {
    "firebase-admin": "^13.0.0",
    "firebase-functions": "^7.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.9.0",
    "vitest": "^3.2.0"
  }
}
```

Run:

```bash
pnpm install
```

Expected: the root lockfile contains the web SDK, Firebase CLI, rules test library, Admin SDK, and Functions SDK.

- [ ] **Step 2: Add strict Functions TypeScript configuration**

Create `functions/tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "lib",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

Create `functions/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		fileParallelism: false,
		include: ['src/**/*.test.ts'],
	},
})
```

Create `vitest.firebase.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		environment: 'node',
		fileParallelism: false,
		include: ['src/lib/firebase/firestore.rules.test.ts'],
	},
})
```

Change the root `vitest.config.ts` import to the first line below, then add the
`exclude` property inside its existing `test` object:

```ts
import { configDefaults, defineConfig } from 'vitest/config'

exclude: [
	...configDefaults.exclude,
	'src/lib/firebase/firestore.rules.test.ts',
],
```

- [ ] **Step 3: Add Firebase and emulator configuration**

Create `firebase.json`:

```json
{
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "predeploy": ["pnpm --dir \"$RESOURCE_DIR\" build"],
      "ignore": ["node_modules", "src", "*.log", "*.local"]
    }
  ],
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "functions": {
      "port": 5001
    },
    "ui": {
      "enabled": true,
      "port": 4000
    },
    "singleProjectMode": true
  }
}
```

Create `firestore.indexes.json`:

```json
{
  "indexes": [],
  "fieldOverrides": []
}
```

Create a deny-all `firestore.rules` baseline:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Add these scripts to the root `package.json`:

```json
{
  "scripts": {
    "firebase:emulators": "pnpm --dir functions build && firebase emulators:start --project demo-number-guessing",
    "firebase:emulators:exec": "pnpm --dir functions build && firebase emulators:exec --project demo-number-guessing --only auth,firestore,functions",
    "firebase:firestore:exec": "firebase emulators:exec --project demo-number-guessing --only firestore",
    "test:functions": "pnpm --dir functions test",
    "test:firebase": "pnpm firebase:emulators:exec \"pnpm --dir functions test:emulator && pnpm vitest run --config vitest.firebase.config.ts\"",
    "test:e2e:online": "pnpm firebase:emulators:exec \"pnpm exec playwright test e2e/online-multiplayer.spec.ts\""
  }
}
```

- [ ] **Step 4: Add the safe environment template**

Create `.env.example`:

```dotenv
PUBLIC_FIREBASE_API_KEY=
PUBLIC_FIREBASE_AUTH_DOMAIN=
PUBLIC_FIREBASE_PROJECT_ID=
PUBLIC_FIREBASE_STORAGE_BUCKET=
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
PUBLIC_FIREBASE_APP_ID=
PUBLIC_FIREBASE_FUNCTIONS_REGION=us-central1
```

Append to `.gitignore`:

```gitignore

# Firebase
.firebaserc
.firebase/
firebase-debug.log
firestore-debug.log
ui-debug.log
functions/lib/
```

Remove the existing `!.env.test` exception so all real `.env.*` files remain
ignored; keep only the `.env.example` exception.

- [ ] **Step 5: Verify the scaffold**

Run:

```bash
pnpm check
pnpm exec firebase --version
```

Expected: the existing app still checks cleanly and the Firebase CLI prints its version.

- [ ] **Step 6: Commit**

```bash
git add README.md package.json pnpm-lock.yaml pnpm-workspace.yaml .gitignore .env.example firebase.json firestore.rules firestore.indexes.json functions/package.json functions/tsconfig.json functions/vitest.config.ts vitest.config.ts vitest.firebase.config.ts
git commit -m "build: scaffold Firebase online multiplayer"
```

---

### Task 2: Build and test the pure server game domain

**Files:**
- Create: `functions/src/domain.test.ts`
- Create: `functions/src/domain.ts`

- [ ] **Step 1: Write failing validation and resolution tests**

Create `functions/src/domain.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
	calculateFeedback,
	normalizeRoomId,
	resolveGuess,
	validateDigitCount,
	validateGuess,
	validateMaxPlayers,
	validateName,
} from './domain.js'

describe('online room domain', () => {
	it('normalizes a room id', () => {
		expect(normalizeRoomId(' ab2c3d ')).toBe('AB2C3D')
	})

	it('rejects malformed room ids', () => {
		expect(() => normalizeRoomId('ABC')).toThrow('ROOM_ID_INVALID')
	})

	it('validates names and settings', () => {
		expect(validateName(' Ada ')).toBe('Ada')
		expect(validateDigitCount(5)).toBe(5)
		expect(validateMaxPlayers(4)).toBe(4)
		expect(() => validateName('')).toThrow('NAME_INVALID')
		expect(() => validateDigitCount(6)).toThrow('DIGIT_COUNT_INVALID')
		expect(() => validateMaxPlayers(1)).toThrow('PLAYER_COUNT_INVALID')
	})

	it('validates and pads numeric guesses', () => {
		expect(validateGuess('7', 3)).toBe('007')
		expect(() => validateGuess('7x', 3)).toThrow('GUESS_INVALID')
	})

	it('counts duplicate digits consistently', () => {
		expect(calculateFeedback('112', '121')).toEqual({
			correctDigits: 3,
			correctPositions: 1,
		})
	})

	it('keeps the turn after a correct elimination', () => {
		expect(
			resolveGuess({
				playerOrder: ['host', 'p2', 'p3'],
				eliminatedUids: [],
				currentGuesserUid: 'host',
				targetUid: 'p2',
				guess: '123',
				targetNumber: '123',
			}),
		).toEqual({
			correct: true,
			correctDigits: 3,
			correctPositions: 3,
			eliminatedUid: 'p2',
			nextGuesserUid: 'host',
			winnerUid: null,
		})
	})

	it('rotates after an incorrect guess', () => {
		expect(
			resolveGuess({
				playerOrder: ['host', 'p2', 'p3'],
				eliminatedUids: ['p2'],
				currentGuesserUid: 'host',
				targetUid: 'p3',
				guess: '111',
				targetNumber: '123',
			}),
		).toMatchObject({
			correct: false,
			nextGuesserUid: 'p3',
			winnerUid: null,
		})
	})

	it('declares the final active player as winner', () => {
		expect(
			resolveGuess({
				playerOrder: ['host', 'p2'],
				eliminatedUids: [],
				currentGuesserUid: 'host',
				targetUid: 'p2',
				guess: '123',
				targetNumber: '123',
			}),
		).toMatchObject({
			eliminatedUid: 'p2',
			nextGuesserUid: null,
			winnerUid: 'host',
		})
	})
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm --dir functions test
```

Expected: FAIL because `functions/src/domain.ts` does not exist.

- [ ] **Step 3: Implement the pure domain**

Create `functions/src/domain.ts`:

```ts
export type DomainErrorCode =
	| 'ROOM_ID_INVALID'
	| 'NAME_INVALID'
	| 'DIGIT_COUNT_INVALID'
	| 'PLAYER_COUNT_INVALID'
	| 'GUESS_INVALID'

export class DomainError extends Error {
	constructor(public readonly code: DomainErrorCode) {
		super(code)
	}
}

const roomIdPattern = /^[A-Z2-9]{6}$/

export function normalizeRoomId(value: unknown): string {
	if (typeof value !== 'string') {
		throw new DomainError('ROOM_ID_INVALID')
	}
	const roomId = value.trim().toUpperCase()
	if (!roomIdPattern.test(roomId)) {
		throw new DomainError('ROOM_ID_INVALID')
	}
	return roomId
}

export function validateName(value: unknown): string {
	if (typeof value !== 'string') {
		throw new DomainError('NAME_INVALID')
	}
	const name = value.trim()
	if (name.length < 1 || name.length > 20) {
		throw new DomainError('NAME_INVALID')
	}
	return name
}

export function validateDigitCount(value: unknown): number {
	if (!Number.isInteger(value) || Number(value) < 2 || Number(value) > 5) {
		throw new DomainError('DIGIT_COUNT_INVALID')
	}
	return Number(value)
}

export function validateMaxPlayers(value: unknown): number {
	if (!Number.isInteger(value) || Number(value) < 2 || Number(value) > 4) {
		throw new DomainError('PLAYER_COUNT_INVALID')
	}
	return Number(value)
}

export function validateGuess(value: unknown, digitCount: number): string {
	if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
		throw new DomainError('GUESS_INVALID')
	}
	const guess = value.trim().padStart(digitCount, '0')
	if (guess.length !== digitCount) {
		throw new DomainError('GUESS_INVALID')
	}
	return guess
}

export function calculateFeedback(
	guess: string,
	target: string,
): { correctDigits: number; correctPositions: number } {
	let correctPositions = 0
	const guessCounts: Record<string, number> = {}
	const targetCounts: Record<string, number> = {}

	for (let index = 0; index < guess.length; index += 1) {
		if (guess[index] === target[index]) {
			correctPositions += 1
		}
		guessCounts[guess[index]] = (guessCounts[guess[index]] ?? 0) + 1
		targetCounts[target[index]] = (targetCounts[target[index]] ?? 0) + 1
	}

	const correctDigits = Object.entries(guessCounts).reduce(
		(total, [digit, count]) => total + Math.min(count, targetCounts[digit] ?? 0),
		0,
	)

	return { correctDigits, correctPositions }
}

interface ResolveGuessInput {
	playerOrder: string[]
	eliminatedUids: string[]
	currentGuesserUid: string
	targetUid: string
	guess: string
	targetNumber: string
}

interface GuessResolution {
	correct: boolean
	correctDigits: number
	correctPositions: number
	eliminatedUid: string | null
	nextGuesserUid: string | null
	winnerUid: string | null
}

export function resolveGuess(input: ResolveGuessInput): GuessResolution {
	const feedback = calculateFeedback(input.guess, input.targetNumber)
	const correct = input.guess === input.targetNumber
	const eliminated = new Set(input.eliminatedUids)

	if (correct) {
		eliminated.add(input.targetUid)
	}

	const active = input.playerOrder.filter((uid) => !eliminated.has(uid))
	const winnerUid = active.length === 1 ? active[0] : null

	if (winnerUid) {
		return {
			correct,
			...feedback,
			eliminatedUid: correct ? input.targetUid : null,
			nextGuesserUid: null,
			winnerUid,
		}
	}

	if (correct) {
		return {
			correct,
			...feedback,
			eliminatedUid: input.targetUid,
			nextGuesserUid: input.currentGuesserUid,
			winnerUid: null,
		}
	}

	const currentIndex = input.playerOrder.indexOf(input.currentGuesserUid)
	let nextIndex = (currentIndex + 1) % input.playerOrder.length
	while (eliminated.has(input.playerOrder[nextIndex])) {
		nextIndex = (nextIndex + 1) % input.playerOrder.length
	}

	return {
		correct,
		...feedback,
		eliminatedUid: null,
		nextGuesserUid: input.playerOrder[nextIndex],
		winnerUid: null,
	}
}
```

- [ ] **Step 4: Run the tests**

Run:

```bash
pnpm --dir functions test
pnpm --dir functions build
```

Expected: all domain tests PASS and strict TypeScript compilation exits 0.

- [ ] **Step 5: Commit**

```bash
git add functions/src/domain.ts functions/src/domain.test.ts
git commit -m "feat: add authoritative online game rules"
```

---

### Task 3: Add Firestore types, stable errors, and create/join commands

**Files:**
- Create: `functions/src/errors.ts`
- Create: `functions/src/firestore.ts`
- Create: `functions/src/roomCommands.test.ts`
- Create: `functions/src/roomCommands.ts`

- [ ] **Step 1: Define stable command errors**

Create `functions/src/errors.ts`:

```ts
import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https'
import { DomainError } from './domain.js'

export class CommandError extends Error {
	constructor(
		public readonly code: FunctionsErrorCode,
		public readonly reason: string,
	) {
		super(reason)
	}
}

export function toHttpsError(error: unknown): HttpsError {
	if (error instanceof CommandError) {
		return new HttpsError(error.code, error.reason)
	}
	if (error instanceof DomainError) {
		return new HttpsError('invalid-argument', error.code)
	}
	return new HttpsError('internal', 'ONLINE_GAME_INTERNAL')
}

export function requireUid(auth: { uid: string } | undefined): string {
	if (!auth?.uid) {
		throw new CommandError('unauthenticated', 'AUTH_REQUIRED')
	}
	return auth.uid
}
```

- [ ] **Step 2: Define Firestore initialization and public/private types**

Create `functions/src/firestore.ts`:

```ts
import { getApps, initializeApp } from 'firebase-admin/app'
import {
	FieldValue,
	Timestamp,
	getFirestore,
	type Firestore,
} from 'firebase-admin/firestore'

if (getApps().length === 0) {
	initializeApp()
}

export const db = getFirestore()
export { FieldValue, Timestamp }

export type RoomPhase = 'lobby' | 'guessing' | 'finished'

export interface RoomDocument {
	hostUid: string
	phase: RoomPhase
	digitCount: number
	maxPlayers: number
	playerOrder: string[]
	currentGuesserUid: string | null
	winnerUid: string | null
	turnNumber: number
	createdAt: Timestamp
	updatedAt: Timestamp
	expiresAt: Timestamp
}

export interface PlayerDocument {
	name: string
	seat: number
	ready: boolean
	eliminated: boolean
	joinedAt: Timestamp
}

export interface GuessDocument {
	turnNumber: number
	guesserUid: string
	targetUid: string
	guess: string
	correct: boolean
	correctDigits: number
	correctPositions: number
	createdAt: Timestamp
}

export interface SecretDocument {
	number: string
	updatedAt: Timestamp
}

export function roomRef(firestore: Firestore, roomId: string) {
	return firestore.collection('rooms').doc(roomId)
}

export function playerRef(firestore: Firestore, roomId: string, uid: string) {
	return roomRef(firestore, roomId).collection('players').doc(uid)
}

export function secretRef(firestore: Firestore, roomId: string, uid: string) {
	return firestore.collection('roomSecrets').doc(roomId).collection('players').doc(uid)
}
```

- [ ] **Step 3: Write failing create/join emulator tests**

Add this setup and the create/join cases to `functions/src/roomCommands.test.ts`:

```ts
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { Timestamp, getFirestore } from 'firebase-admin/firestore'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createRoom, joinRoom } from './roomCommands.js'

const projectId = 'demo-number-guessing'
const app = initializeApp({ projectId }, 'room-command-tests')
const firestore = getFirestore(app)

async function clearFirestore(): Promise<void> {
	const host = process.env.FIRESTORE_EMULATOR_HOST
	if (!host) {
		throw new Error('FIRESTORE_EMULATOR_HOST is required')
	}
	await fetch(
		`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
		{ method: 'DELETE' },
	)
}

beforeEach(clearFirestore)
afterAll(() => deleteApp(app))

describe('room commands', () => {
	it('creates a six-character room with the host as seat zero', async () => {
		const result = await createRoom(
			'host',
			{ name: 'Ada', digitCount: 3, maxPlayers: 3 },
			{ firestore, roomIdFactory: () => 'AB2C3D' },
		)

		expect(result).toEqual({ roomId: 'AB2C3D' })
		const room = await firestore.collection('rooms').doc('AB2C3D').get()
		expect(room.data()).toMatchObject({
			hostUid: 'host',
			phase: 'lobby',
			digitCount: 3,
			maxPlayers: 3,
			playerOrder: ['host'],
		})
	})

	it('joins an existing lobby and is idempotent for the same uid', async () => {
		await createRoom(
			'host',
			{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
			{ firestore, roomIdFactory: () => 'AB2C3D' },
		)
		await joinRoom('p2', { roomId: 'ab2c3d', name: 'Lin' }, { firestore })
		await joinRoom('p2', { roomId: 'AB2C3D', name: 'Lin' }, { firestore })

		const room = await firestore.collection('rooms').doc('AB2C3D').get()
		expect(room.data()?.playerOrder).toEqual(['host', 'p2'])
	})

	it('rejects joining a full room', async () => {
		await createRoom(
			'host',
			{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
			{ firestore, roomIdFactory: () => 'AB2C3D' },
		)
		await joinRoom('p2', { roomId: 'AB2C3D', name: 'Lin' }, { firestore })

		await expect(
			joinRoom('p3', { roomId: 'AB2C3D', name: 'Sam' }, { firestore }),
		).rejects.toMatchObject({ code: 'resource-exhausted' })
	})

	it('admits only one player when the final seat is contested', async () => {
		await createRoom(
			'host',
			{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
			{ firestore, roomIdFactory: () => 'AB2C3D' },
		)

		const results = await Promise.allSettled([
			joinRoom('p2', { roomId: 'AB2C3D', name: 'Lin' }, { firestore }),
			joinRoom('p3', { roomId: 'AB2C3D', name: 'Grace' }, { firestore }),
		])

		expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
		const room = await firestore.collection('rooms').doc('AB2C3D').get()
		expect(room.data()?.playerOrder).toHaveLength(2)
	})

	it('treats an expired room as missing', async () => {
		const createdAt = Timestamp.fromDate(new Date('2026-07-27T00:00:00Z'))
		await createRoom(
			'host',
			{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
			{
				firestore,
				roomIdFactory: () => 'AB2C3D',
				now: () => createdAt,
			},
		)

		await expect(
			joinRoom(
				'p2',
				{ roomId: 'AB2C3D', name: 'Lin' },
				{
					firestore,
					now: () => Timestamp.fromMillis(createdAt.toMillis() + 86_400_001),
				},
			),
		).rejects.toMatchObject({ code: 'not-found' })
	})
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run:

```bash
pnpm firebase:firestore:exec "pnpm --dir functions exec vitest run src/roomCommands.test.ts"
pnpm --dir functions build
```

Expected: FAIL because `roomCommands.ts` does not exist.

- [ ] **Step 5: Implement create and join transactions**

Create `functions/src/roomCommands.ts` with these exported contracts and transaction behavior:

```ts
import { randomInt } from 'node:crypto'
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import {
	normalizeRoomId,
	validateDigitCount,
	validateMaxPlayers,
	validateName,
} from './domain.js'
import { CommandError } from './errors.js'
import {
	db,
	playerRef,
	roomRef,
	type PlayerDocument,
	type RoomDocument,
} from './firestore.js'

const roomAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function expiresAt(now: Timestamp): Timestamp {
	return Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000)
}

function randomRoomId(): string {
	return Array.from(
		{ length: 6 },
		() => roomAlphabet[randomInt(roomAlphabet.length)],
	).join('')
}

interface CommandOptions {
	firestore?: Firestore
	now?: () => Timestamp
	roomIdFactory?: () => string
}

export async function createRoom(
	uid: string,
	input: { name: unknown; digitCount: unknown; maxPlayers: unknown },
	options: CommandOptions = {},
): Promise<{ roomId: string }> {
	const firestore = options.firestore ?? db
	const now = (options.now ?? Timestamp.now)()
	const name = validateName(input.name)
	const digitCount = validateDigitCount(input.digitCount)
	const maxPlayers = validateMaxPlayers(input.maxPlayers)
	const makeRoomId = options.roomIdFactory ?? randomRoomId

	for (let attempt = 0; attempt < 8; attempt += 1) {
		const roomId = normalizeRoomId(makeRoomId())
		const room = roomRef(firestore, roomId)
		const player = playerRef(firestore, roomId, uid)
		const created = await firestore.runTransaction(async (transaction) => {
			if ((await transaction.get(room)).exists) {
				return false
			}
			const roomData: RoomDocument = {
				hostUid: uid,
				phase: 'lobby',
				digitCount,
				maxPlayers,
				playerOrder: [uid],
				currentGuesserUid: null,
				winnerUid: null,
				turnNumber: 0,
				createdAt: now,
				updatedAt: now,
				expiresAt: expiresAt(now),
			}
			const playerData: PlayerDocument = {
				name,
				seat: 0,
				ready: false,
				eliminated: false,
				joinedAt: now,
			}
			transaction.create(room, roomData)
			transaction.create(player, playerData)
			return true
		})
		if (created) {
			return { roomId }
		}
	}
	throw new CommandError('aborted', 'ROOM_ID_COLLISION')
}

export async function joinRoom(
	uid: string,
	input: { roomId: unknown; name: unknown },
	options: CommandOptions = {},
): Promise<{ roomId: string }> {
	const firestore = options.firestore ?? db
	const now = (options.now ?? Timestamp.now)()
	const roomId = normalizeRoomId(input.roomId)
	const name = validateName(input.name)
	const room = roomRef(firestore, roomId)
	const player = playerRef(firestore, roomId, uid)

	await firestore.runTransaction(async (transaction) => {
		const [roomSnapshot, playerSnapshot] = await Promise.all([
			transaction.get(room),
			transaction.get(player),
		])
		if (!roomSnapshot.exists) {
			throw new CommandError('not-found', 'ROOM_NOT_FOUND')
		}
		const roomData = roomSnapshot.data() as RoomDocument
		if (roomData.expiresAt.toMillis() <= now.toMillis()) {
			throw new CommandError('not-found', 'ROOM_NOT_FOUND')
		}
		if (playerSnapshot.exists) {
			transaction.update(room, {
				updatedAt: now,
				expiresAt: expiresAt(now),
			})
			return
		}
		if (roomData.phase !== 'lobby') {
			throw new CommandError('failed-precondition', 'ROOM_ALREADY_STARTED')
		}
		if (roomData.playerOrder.length >= roomData.maxPlayers) {
			throw new CommandError('resource-exhausted', 'ROOM_FULL')
		}
		const playerData: PlayerDocument = {
			name,
			seat: roomData.playerOrder.length,
			ready: false,
			eliminated: false,
			joinedAt: now,
		}
		transaction.create(player, playerData)
		transaction.update(room, {
			playerOrder: [...roomData.playerOrder, uid],
			updatedAt: now,
			expiresAt: expiresAt(now),
		})
	})

	return { roomId }
}
```

- [ ] **Step 6: Run the emulator tests**

Run:

```bash
pnpm firebase:firestore:exec "pnpm --dir functions exec vitest run src/roomCommands.test.ts"
pnpm --dir functions build
```

Expected: create, idempotent join, and capacity tests PASS.

- [ ] **Step 7: Commit**

```bash
git add functions/src/errors.ts functions/src/firestore.ts functions/src/roomCommands.ts functions/src/roomCommands.test.ts
git commit -m "feat: add secure room creation and joining"
```

---

### Task 4: Add secret, start, leave, and restart commands

**Files:**
- Modify: `functions/src/roomCommands.test.ts`
- Modify: `functions/src/roomCommands.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Replace the Firestore and room command imports with:

```ts
import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore'
import {
	createRoom,
	joinRoom,
	leaveRoom,
	restartRoom,
	setSecret,
	startRoom,
} from './roomCommands.js'
```

Append these tests:

```ts
it('stores a secret privately and starts only when the room is full and ready', async () => {
	await createRoom(
		'host',
		{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
		{ firestore, roomIdFactory: () => 'AB2C3D' },
	)
	await joinRoom('p2', { roomId: 'AB2C3D', name: 'Lin' }, { firestore })
	await setSecret('host', { roomId: 'AB2C3D', number: '123' }, { firestore })
	await expect(startRoom('host', { roomId: 'AB2C3D' }, { firestore }))
		.rejects.toMatchObject({ code: 'failed-precondition' })
	await setSecret('p2', { roomId: 'AB2C3D', number: '456' }, { firestore })
	await startRoom('host', { roomId: 'AB2C3D' }, { firestore })

	const room = await firestore.collection('rooms').doc('AB2C3D').get()
	expect(room.data()).toMatchObject({
		phase: 'guessing',
		currentGuesserUid: 'host',
	})
	const publicHost = await firestore
		.collection('rooms')
		.doc('AB2C3D')
		.collection('players')
		.doc('host')
		.get()
	expect(publicHost.data()).not.toHaveProperty('number')
})

it('transfers host ownership when the host leaves the lobby', async () => {
	await createRoom(
		'host',
		{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
		{ firestore, roomIdFactory: () => 'AB2C3D' },
	)
	await joinRoom('p2', { roomId: 'AB2C3D', name: 'Lin' }, { firestore })
	await leaveRoom('host', { roomId: 'AB2C3D' }, { firestore })

	const room = await firestore.collection('rooms').doc('AB2C3D').get()
	expect(room.data()).toMatchObject({
		hostUid: 'p2',
		playerOrder: ['p2'],
	})
})

it('rejects voluntary leave during an active match', async () => {
	await createRoom(
		'host',
		{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
		{ firestore, roomIdFactory: () => 'AB2C3D' },
	)
	await joinRoom('p2', { roomId: 'AB2C3D', name: 'Lin' }, { firestore })
	await setSecret('host', { roomId: 'AB2C3D', number: '123' }, { firestore })
	await setSecret('p2', { roomId: 'AB2C3D', number: '456' }, { firestore })
	await startRoom('host', { roomId: 'AB2C3D' }, { firestore })

	await expect(
		leaveRoom('p2', { roomId: 'AB2C3D' }, { firestore }),
	).rejects.toMatchObject({ code: 'failed-precondition' })
})

it('restarts a finished room without retaining secrets or guesses', async () => {
	await seedFinishedRoom(firestore, 'AB2C3D')
	await restartRoom('host', { roomId: 'AB2C3D' }, { firestore })

	const room = await firestore.collection('rooms').doc('AB2C3D').get()
	expect(room.data()).toMatchObject({
		phase: 'lobby',
		currentGuesserUid: null,
		winnerUid: null,
		turnNumber: 0,
	})
	expect((await room.ref.collection('guesses').get()).empty).toBe(true)
	expect(
		(
			await firestore
				.collection('roomSecrets')
				.doc('AB2C3D')
				.collection('players')
				.get()
		).empty,
	).toBe(true)
	const players = await room.ref.collection('players').get()
	expect(players.docs.every((player) => player.data().ready === false)).toBe(true)
	expect(players.docs.every((player) => player.data().eliminated === false)).toBe(true)
})
```

Add this helper above the tests:

```ts
async function seedFinishedRoom(
	target: Firestore,
	roomId: string,
): Promise<void> {
	const now = Timestamp.fromDate(new Date('2026-07-27T00:00:00Z'))
	const room = target.collection('rooms').doc(roomId)
	const batch = target.batch()
	batch.set(room, {
		hostUid: 'host',
		phase: 'finished',
		digitCount: 3,
		maxPlayers: 2,
		playerOrder: ['host', 'p2'],
		currentGuesserUid: null,
		winnerUid: 'host',
		turnNumber: 1,
		createdAt: now,
		updatedAt: now,
		expiresAt: Timestamp.fromMillis(now.toMillis() + 86_400_000),
	})
	batch.set(room.collection('players').doc('host'), {
		name: 'Ada',
		seat: 0,
		ready: true,
		eliminated: false,
		joinedAt: now,
	})
	batch.set(room.collection('players').doc('p2'), {
		name: 'Lin',
		seat: 1,
		ready: true,
		eliminated: true,
		joinedAt: now,
	})
	batch.set(room.collection('guesses').doc('guess-1'), {
		turnNumber: 1,
		guesserUid: 'host',
		targetUid: 'p2',
		guess: '456',
		correct: true,
		correctDigits: 3,
		correctPositions: 3,
		createdAt: now,
	})
	batch.set(
		target.collection('roomSecrets').doc(roomId).collection('players').doc('host'),
		{ number: '123', updatedAt: now },
	)
	batch.set(
		target.collection('roomSecrets').doc(roomId).collection('players').doc('p2'),
		{ number: '456', updatedAt: now },
	)
	await batch.commit()
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm firebase:firestore:exec "pnpm --dir functions exec vitest run src/roomCommands.test.ts"
```

Expected: FAIL because `setSecret`, `startRoom`, `leaveRoom`, and `restartRoom` are not exported.

- [ ] **Step 3: Implement the lifecycle commands**

Update the imports to include `validateGuess`, `secretRef`, and
`type SecretDocument`, then append:

```ts
function requireMember(room: RoomDocument, uid: string): void {
	if (!room.playerOrder.includes(uid)) {
		throw new CommandError('permission-denied', 'ROOM_MEMBERSHIP_REQUIRED')
	}
}

function requireHost(room: RoomDocument, uid: string): void {
	if (room.hostUid !== uid) {
		throw new CommandError('permission-denied', 'HOST_REQUIRED')
	}
}

export async function setSecret(
	uid: string,
	input: { roomId: unknown; number: unknown },
	options: CommandOptions = {},
): Promise<{ ready: true }> {
	const firestore = options.firestore ?? db
	const now = (options.now ?? Timestamp.now)()
	const roomId = normalizeRoomId(input.roomId)
	const room = roomRef(firestore, roomId)
	const player = playerRef(firestore, roomId, uid)
	const secret = secretRef(firestore, roomId, uid)

	await firestore.runTransaction(async (transaction) => {
		const [roomSnapshot, playerSnapshot] = await Promise.all([
			transaction.get(room),
			transaction.get(player),
		])
		if (!roomSnapshot.exists || !playerSnapshot.exists) {
			throw new CommandError('not-found', 'ROOM_NOT_FOUND')
		}
		const roomData = roomSnapshot.data() as RoomDocument
		requireMember(roomData, uid)
		if (roomData.phase !== 'lobby') {
			throw new CommandError('failed-precondition', 'ROOM_ALREADY_STARTED')
		}
		const number = validateGuess(input.number, roomData.digitCount)
		const secretData: SecretDocument = { number, updatedAt: now }
		transaction.set(secret, secretData)
		transaction.update(player, { ready: true })
		transaction.update(room, {
			updatedAt: now,
			expiresAt: expiresAt(now),
		})
	})

	return { ready: true }
}

export async function startRoom(
	uid: string,
	input: { roomId: unknown },
	options: CommandOptions = {},
): Promise<{ phase: 'guessing' }> {
	const firestore = options.firestore ?? db
	const now = (options.now ?? Timestamp.now)()
	const roomId = normalizeRoomId(input.roomId)
	const room = roomRef(firestore, roomId)

	await firestore.runTransaction(async (transaction) => {
		const roomSnapshot = await transaction.get(room)
		if (!roomSnapshot.exists) {
			throw new CommandError('not-found', 'ROOM_NOT_FOUND')
		}
		const roomData = roomSnapshot.data() as RoomDocument
		requireHost(roomData, uid)
		if (
			roomData.phase !== 'lobby' ||
			roomData.playerOrder.length !== roomData.maxPlayers
		) {
			throw new CommandError('failed-precondition', 'ROOM_NOT_READY')
		}
		const players = await Promise.all(
			roomData.playerOrder.map((playerUid) =>
				transaction.get(playerRef(firestore, roomId, playerUid)),
			),
		)
		if (
			players.some(
				(snapshot) =>
					!snapshot.exists || !(snapshot.data() as PlayerDocument).ready,
			)
		) {
			throw new CommandError('failed-precondition', 'ROOM_NOT_READY')
		}
		transaction.update(room, {
			phase: 'guessing',
			currentGuesserUid: roomData.playerOrder[0],
			turnNumber: 0,
			updatedAt: now,
			expiresAt: expiresAt(now),
		})
	})

	return { phase: 'guessing' }
}

export async function leaveRoom(
	uid: string,
	input: { roomId: unknown },
	options: CommandOptions = {},
): Promise<{ left: true }> {
	const firestore = options.firestore ?? db
	const now = (options.now ?? Timestamp.now)()
	const roomId = normalizeRoomId(input.roomId)
	const room = roomRef(firestore, roomId)
	const leavingPlayer = playerRef(firestore, roomId, uid)
	const leavingSecret = secretRef(firestore, roomId, uid)

	const empty = await firestore.runTransaction(async (transaction) => {
		const roomSnapshot = await transaction.get(room)
		if (!roomSnapshot.exists) {
			throw new CommandError('not-found', 'ROOM_NOT_FOUND')
		}
		const roomData = roomSnapshot.data() as RoomDocument
		requireMember(roomData, uid)
		if (roomData.phase === 'guessing') {
			throw new CommandError('failed-precondition', 'ACTIVE_MATCH_LEAVE_DENIED')
		}
		const remaining = roomData.playerOrder.filter((playerUid) => playerUid !== uid)
		const remainingPlayers = await Promise.all(
			remaining.map((playerUid) =>
				transaction.get(playerRef(firestore, roomId, playerUid)),
			),
		)
		transaction.delete(leavingPlayer)
		transaction.delete(leavingSecret)
		if (remaining.length === 0) {
			transaction.delete(room)
			return true
		}
		remainingPlayers.forEach((snapshot, seat) => {
			transaction.update(snapshot.ref, { seat })
		})
		transaction.update(room, {
			hostUid: roomData.hostUid === uid ? remaining[0] : roomData.hostUid,
			playerOrder: remaining,
			updatedAt: now,
			expiresAt: expiresAt(now),
		})
		return false
	})

	if (empty) {
		await firestore.recursiveDelete(room)
		await firestore.recursiveDelete(firestore.collection('roomSecrets').doc(roomId))
	}
	return { left: true }
}

export async function restartRoom(
	uid: string,
	input: { roomId: unknown },
	options: CommandOptions = {},
): Promise<{ phase: 'lobby' }> {
	const firestore = options.firestore ?? db
	const now = (options.now ?? Timestamp.now)()
	const roomId = normalizeRoomId(input.roomId)
	const room = roomRef(firestore, roomId)
	const initialSnapshot = await room.get()
	if (!initialSnapshot.exists) {
		throw new CommandError('not-found', 'ROOM_NOT_FOUND')
	}
	const initialRoom = initialSnapshot.data() as RoomDocument
	requireHost(initialRoom, uid)
	if (initialRoom.phase !== 'finished') {
		throw new CommandError('failed-precondition', 'ROOM_NOT_FINISHED')
	}

	await firestore.recursiveDelete(room.collection('guesses'))
	await firestore.recursiveDelete(firestore.collection('roomSecrets').doc(roomId))

	await firestore.runTransaction(async (transaction) => {
		const roomSnapshot = await transaction.get(room)
		if (!roomSnapshot.exists) {
			throw new CommandError('not-found', 'ROOM_NOT_FOUND')
		}
		const roomData = roomSnapshot.data() as RoomDocument
		requireHost(roomData, uid)
		if (roomData.phase !== 'finished') {
			throw new CommandError('failed-precondition', 'ROOM_NOT_FINISHED')
		}
		const players = await Promise.all(
			roomData.playerOrder.map((playerUid) =>
				transaction.get(playerRef(firestore, roomId, playerUid)),
			),
		)
		players.forEach((snapshot) => {
			transaction.update(snapshot.ref, { ready: false, eliminated: false })
		})
		transaction.update(room, {
			phase: 'lobby',
			currentGuesserUid: null,
			winnerUid: null,
			turnNumber: 0,
			updatedAt: now,
			expiresAt: expiresAt(now),
		})
	})

	return { phase: 'lobby' }
}
```

- [ ] **Step 4: Run lifecycle tests**

Run:

```bash
pnpm firebase:firestore:exec "pnpm --dir functions exec vitest run src/roomCommands.test.ts"
pnpm --dir functions build
```

Expected: all room lifecycle tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/roomCommands.ts functions/src/roomCommands.test.ts
git commit -m "feat: add secure online room lifecycle"
```

---

### Task 5: Add transactional guessing

**Files:**
- Create: `functions/src/guessCommand.test.ts`
- Create: `functions/src/guessCommand.ts`

- [ ] **Step 1: Write failing guess command tests**

Create `functions/src/guessCommand.test.ts` with:

```ts
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { submitGuess } from './guessCommand.js'

const projectId = 'demo-number-guessing'
const app = initializeApp({ projectId }, 'guess-command-tests')
const firestore = getFirestore(app)

async function clearFirestore(): Promise<void> {
	const host = process.env.FIRESTORE_EMULATOR_HOST
	if (!host) {
		throw new Error('FIRESTORE_EMULATOR_HOST is required')
	}
	await fetch(
		`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
		{ method: 'DELETE' },
	)
}

async function seedStartedRoom(
	target: Firestore,
	input: {
		roomId: string
		playerOrder: string[]
		secrets: Record<string, string>
	},
): Promise<void> {
	const now = Timestamp.fromDate(new Date('2026-07-27T00:00:00Z'))
	const room = target.collection('rooms').doc(input.roomId)
	const batch = target.batch()
	batch.set(room, {
		hostUid: input.playerOrder[0],
		phase: 'guessing',
		digitCount: 3,
		maxPlayers: input.playerOrder.length,
		playerOrder: input.playerOrder,
		currentGuesserUid: input.playerOrder[0],
		winnerUid: null,
		turnNumber: 0,
		createdAt: now,
		updatedAt: now,
		expiresAt: Timestamp.fromMillis(now.toMillis() + 86_400_000),
	})
	input.playerOrder.forEach((uid, seat) => {
		batch.set(room.collection('players').doc(uid), {
			name: uid === 'host' ? 'Ada' : `Player ${seat + 1}`,
			seat,
			ready: true,
			eliminated: false,
			joinedAt: now,
		})
		batch.set(
			target
				.collection('roomSecrets')
				.doc(input.roomId)
				.collection('players')
				.doc(uid),
			{ number: input.secrets[uid], updatedAt: now },
		)
	})
	await batch.commit()
}

beforeEach(clearFirestore)
afterAll(() => deleteApp(app))

describe('submitGuess', () => {
```

Append these tests inside the `describe` block, then close it with `})`:

```ts
it('records feedback and rotates after an incorrect guess', async () => {
	await seedStartedRoom(firestore, {
		roomId: 'AB2C3D',
		playerOrder: ['host', 'p2'],
		secrets: { host: '123', p2: '456' },
	})

	const result = await submitGuess(
		'host',
		{ roomId: 'AB2C3D', targetUid: 'p2', guess: '451', turnNumber: 0 },
		{ firestore },
	)

	expect(result).toMatchObject({
		correct: false,
		correctDigits: 2,
		correctPositions: 2,
	})
	const room = await firestore.collection('rooms').doc('AB2C3D').get()
	expect(room.data()).toMatchObject({
		currentGuesserUid: 'p2',
		turnNumber: 1,
	})
})

it('eliminates a target and finishes with one active player', async () => {
	await seedStartedRoom(firestore, {
		roomId: 'AB2C3D',
		playerOrder: ['host', 'p2'],
		secrets: { host: '123', p2: '456' },
	})

	await submitGuess(
		'host',
		{ roomId: 'AB2C3D', targetUid: 'p2', guess: '456', turnNumber: 0 },
		{ firestore },
	)

	const room = await firestore.collection('rooms').doc('AB2C3D').get()
	expect(room.data()).toMatchObject({
		phase: 'finished',
		winnerUid: 'host',
		currentGuesserUid: null,
	})
})

it('rejects stale concurrent turns', async () => {
	await seedStartedRoom(firestore, {
		roomId: 'AB2C3D',
		playerOrder: ['host', 'p2'],
		secrets: { host: '123', p2: '456' },
	})

	await submitGuess(
		'host',
		{ roomId: 'AB2C3D', targetUid: 'p2', guess: '451', turnNumber: 0 },
		{ firestore },
	)

	await expect(
		submitGuess(
			'host',
			{ roomId: 'AB2C3D', targetUid: 'p2', guess: '452', turnNumber: 0 },
			{ firestore },
		),
	).rejects.toMatchObject({ code: 'failed-precondition' })
})

})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm firebase:firestore:exec "pnpm --dir functions exec vitest run src/guessCommand.test.ts"
pnpm --dir functions build
```

Expected: FAIL because `guessCommand.ts` does not exist.

- [ ] **Step 3: Implement `submitGuess`**

Create `functions/src/guessCommand.ts` with:

```ts
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { normalizeRoomId, resolveGuess, validateGuess } from './domain.js'
import { CommandError } from './errors.js'
import {
	db,
	playerRef,
	roomRef,
	secretRef,
	type GuessDocument,
	type PlayerDocument,
	type RoomDocument,
	type SecretDocument,
} from './firestore.js'

interface GuessOptions {
	firestore?: Firestore
	now?: () => Timestamp
}

export async function submitGuess(
	uid: string,
	input: {
		roomId: unknown
		targetUid: unknown
		guess: unknown
		turnNumber: unknown
	},
	options: GuessOptions = {},
): Promise<{
	guessId: string
	correct: boolean
	correctDigits: number
	correctPositions: number
}> {
	const firestore = options.firestore ?? db
	const now = (options.now ?? Timestamp.now)()
	const roomId = normalizeRoomId(input.roomId)
	if (typeof input.targetUid !== 'string' || !Number.isInteger(input.turnNumber)) {
		throw new CommandError('invalid-argument', 'GUESS_INPUT_INVALID')
	}
	const room = roomRef(firestore, roomId)
	const target = playerRef(firestore, roomId, input.targetUid)
	const targetSecret = secretRef(firestore, roomId, input.targetUid)
	const guessDocument = room.collection('guesses').doc()

	const result = await firestore.runTransaction(async (transaction) => {
		const [roomSnapshot, targetSnapshot, secretSnapshot] = await Promise.all([
			transaction.get(room),
			transaction.get(target),
			transaction.get(targetSecret),
		])
		if (!roomSnapshot.exists) {
			throw new CommandError('not-found', 'ROOM_NOT_FOUND')
		}
		const roomData = roomSnapshot.data() as RoomDocument
		if (roomData.phase !== 'guessing') {
			throw new CommandError('failed-precondition', 'ROOM_NOT_GUESSING')
		}
		if (!roomData.playerOrder.includes(uid)) {
			throw new CommandError('permission-denied', 'ROOM_MEMBERSHIP_REQUIRED')
		}
		if (roomData.currentGuesserUid !== uid || roomData.turnNumber !== input.turnNumber) {
			throw new CommandError('failed-precondition', 'TURN_STALE')
		}
		if (input.targetUid === uid || !targetSnapshot.exists || !secretSnapshot.exists) {
			throw new CommandError('failed-precondition', 'TARGET_INVALID')
		}
		const targetData = targetSnapshot.data() as PlayerDocument
		if (targetData.eliminated) {
			throw new CommandError('failed-precondition', 'TARGET_ELIMINATED')
		}
		const guess = validateGuess(input.guess, roomData.digitCount)
		const secret = secretSnapshot.data() as SecretDocument
		const playerSnapshots = await Promise.all(
			roomData.playerOrder.map((playerUid) =>
				transaction.get(playerRef(firestore, roomId, playerUid)),
			),
		)
		const eliminatedUids = playerSnapshots
			.filter((snapshot) => (snapshot.data() as PlayerDocument).eliminated)
			.map((snapshot) => snapshot.id)
		const resolution = resolveGuess({
			playerOrder: roomData.playerOrder,
			eliminatedUids,
			currentGuesserUid: uid,
			targetUid: input.targetUid,
			guess,
			targetNumber: secret.number,
		})
		const nextTurnNumber = roomData.turnNumber + 1
		const guessData: GuessDocument = {
			turnNumber: nextTurnNumber,
			guesserUid: uid,
			targetUid: input.targetUid,
			guess,
			correct: resolution.correct,
			correctDigits: resolution.correctDigits,
			correctPositions: resolution.correctPositions,
			createdAt: now,
		}
		transaction.create(guessDocument, guessData)
		if (resolution.eliminatedUid) {
			transaction.update(target, { eliminated: true })
		}
		transaction.update(room, {
			phase: resolution.winnerUid ? 'finished' : 'guessing',
			winnerUid: resolution.winnerUid,
			currentGuesserUid: resolution.nextGuesserUid,
			turnNumber: nextTurnNumber,
			updatedAt: now,
			expiresAt: Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000),
		})
		return resolution
	})

	return {
		guessId: guessDocument.id,
		correct: result.correct,
		correctDigits: result.correctDigits,
		correctPositions: result.correctPositions,
	}
}
```

- [ ] **Step 4: Run the tests**

Run:

```bash
pnpm firebase:firestore:exec "pnpm --dir functions exec vitest run src/guessCommand.test.ts"
pnpm --dir functions build
```

Expected: all transactional guess tests PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/src/guessCommand.ts functions/src/guessCommand.test.ts
git commit -m "feat: validate online guesses transactionally"
```

---

### Task 6: Export callable Functions and scheduled cleanup

**Files:**
- Create: `functions/src/cleanup.test.ts`
- Create: `functions/src/cleanup.ts`
- Create: `functions/src/index.ts`

- [ ] **Step 1: Write a failing cleanup test**

Create `functions/src/cleanup.test.ts`:

```ts
import { deleteApp, initializeApp } from 'firebase-admin/app'
import { Timestamp, getFirestore } from 'firebase-admin/firestore'
import { afterAll, beforeEach, expect, it } from 'vitest'
import { cleanupExpiredRooms } from './cleanup.js'

const projectId = 'demo-number-guessing'
const app = initializeApp({ projectId }, 'cleanup-tests')
const firestore = getFirestore(app)

async function clearFirestore(): Promise<void> {
	const host = process.env.FIRESTORE_EMULATOR_HOST
	if (!host) {
		throw new Error('FIRESTORE_EMULATOR_HOST is required')
	}
	await fetch(
		`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
		{ method: 'DELETE' },
	)
}

beforeEach(clearFirestore)
afterAll(() => deleteApp(app))

it('recursively deletes only expired public and private room data', async () => {
	const now = Timestamp.fromDate(new Date('2026-07-27T00:00:00Z'))
	const batch = firestore.batch()
	for (const [roomId, expiresAt] of [
		['EXPIRED', Timestamp.fromMillis(now.toMillis() - 1)],
		['FRESH1', Timestamp.fromMillis(now.toMillis() + 86_400_000)],
	] as const) {
		const room = firestore.collection('rooms').doc(roomId)
		batch.set(room, { expiresAt })
		batch.set(room.collection('players').doc('host'), { name: 'Ada' })
		batch.set(
			firestore
				.collection('roomSecrets')
				.doc(roomId)
				.collection('players')
				.doc('host'),
			{ number: '123' },
		)
	}
	await batch.commit()

	const deleted = await cleanupExpiredRooms(firestore, now)

	expect(deleted).toEqual(['EXPIRED'])
	expect((await firestore.collection('rooms').doc('EXPIRED').get()).exists).toBe(false)
	expect((await firestore.collection('rooms').doc('FRESH1').get()).exists).toBe(true)
	expect(
		(
			await firestore
				.collection('roomSecrets')
				.doc('EXPIRED')
				.collection('players')
				.doc('host')
				.get()
		).exists,
	).toBe(false)
})
```

- [ ] **Step 2: Run the cleanup test to verify it fails**

Run:

```bash
pnpm firebase:firestore:exec "pnpm --dir functions exec vitest run src/cleanup.test.ts"
```

Expected: FAIL because `cleanup.ts` does not exist.

- [ ] **Step 3: Implement cleanup**

Create `functions/src/cleanup.ts`:

```ts
import { Timestamp, type Firestore } from 'firebase-admin/firestore'
import { db } from './firestore.js'

export async function cleanupExpiredRooms(
	firestore: Firestore = db,
	now: Timestamp = Timestamp.now(),
): Promise<string[]> {
	const expired = await firestore
		.collection('rooms')
		.where('expiresAt', '<=', now)
		.get()

	await Promise.all(
		expired.docs.map(async (room) => {
			await firestore.recursiveDelete(room.ref)
			await firestore.recursiveDelete(
				firestore.collection('roomSecrets').doc(room.id),
			)
		}),
	)

	return expired.docs.map((room) => room.id)
}
```

- [ ] **Step 4: Export callable and scheduled Functions**

Create `functions/src/index.ts`:

```ts
import { setGlobalOptions } from 'firebase-functions/v2'
import { onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { cleanupExpiredRooms } from './cleanup.js'
import { requireUid, toHttpsError } from './errors.js'
import { submitGuess as submitGuessCommand } from './guessCommand.js'
import {
	createRoom as createRoomCommand,
	joinRoom as joinRoomCommand,
	leaveRoom as leaveRoomCommand,
	restartRoom as restartRoomCommand,
	setSecret as setSecretCommand,
	startRoom as startRoomCommand,
} from './roomCommands.js'

setGlobalOptions({ region: 'us-central1', maxInstances: 20 })

function callable<TInput, TOutput>(
	command: (uid: string, input: TInput) => Promise<TOutput>,
) {
	return onCall(async (request) => {
		try {
			return await command(requireUid(request.auth), request.data as TInput)
		} catch (error) {
			throw toHttpsError(error)
		}
	})
}

export const createRoom = callable(createRoomCommand)
export const joinRoom = callable(joinRoomCommand)
export const setSecret = callable(setSecretCommand)
export const startRoom = callable(startRoomCommand)
export const submitGuess = callable(submitGuessCommand)
export const leaveRoom = callable(leaveRoomCommand)
export const restartRoom = callable(restartRoomCommand)

export const cleanupRooms = onSchedule('every 1 hours', async () => {
	await cleanupExpiredRooms()
})
```

- [ ] **Step 5: Run Functions tests and build**

Run:

```bash
pnpm test:functions
pnpm firebase:firestore:exec "pnpm --dir functions test:emulator"
pnpm --dir functions build
```

Expected: pure and emulator-backed Functions tests and the TypeScript build all PASS.

- [ ] **Step 6: Commit**

```bash
git add functions/src/cleanup.ts functions/src/cleanup.test.ts functions/src/index.ts
git commit -m "feat: expose online game Firebase functions"
```

---

### Task 7: Lock down Firestore rules

**Files:**
- Modify: `firestore.rules`
- Create: `src/lib/firebase/firestore.rules.test.ts`

- [ ] **Step 1: Write failing security-rule tests**

Create `src/lib/firebase/firestore.rules.test.ts` using `initializeTestEnvironment`:

```ts
import { readFileSync } from 'node:fs'
import {
	assertFails,
	assertSucceeds,
	initializeTestEnvironment,
	type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let environment: RulesTestEnvironment

beforeAll(async () => {
	environment = await initializeTestEnvironment({
		projectId: 'demo-number-guessing',
		firestore: {
			rules: readFileSync('firestore.rules', 'utf8'),
			host: '127.0.0.1',
			port: 8080,
		},
	})
})

beforeEach(async () => {
	await environment.clearFirestore()
	await environment.withSecurityRulesDisabled(async (context) => {
		const firestore = context.firestore()
		await setDoc(doc(firestore, 'rooms/AB2C3D'), { phase: 'lobby' })
		await setDoc(doc(firestore, 'rooms/AB2C3D/players/member'), { name: 'Ada' })
		await setDoc(doc(firestore, 'roomSecrets/AB2C3D/players/member'), {
			number: '123',
		})
		await setDoc(doc(firestore, 'rooms/ZX2C3D'), { phase: 'lobby' })
		await setDoc(doc(firestore, 'rooms/ZX2C3D/players/other'), { name: 'Lin' })
	})
})

afterAll(async () => {
	await environment.cleanup()
})

describe('firestore rules', () => {
	it('allows members to read public room state', async () => {
		const firestore = environment.authenticatedContext('member').firestore()
		await assertSucceeds(getDoc(doc(firestore, 'rooms/AB2C3D')))
	})

	it('denies nonmembers and anonymous users', async () => {
		const stranger = environment.authenticatedContext('stranger').firestore()
		const anonymous = environment.unauthenticatedContext().firestore()
		await assertFails(getDoc(doc(stranger, 'rooms/AB2C3D')))
		await assertFails(getDoc(doc(anonymous, 'rooms/AB2C3D')))
	})

	it('denies a member access to another room', async () => {
		const firestore = environment.authenticatedContext('member').firestore()
		await assertFails(getDoc(doc(firestore, 'rooms/ZX2C3D')))
		await assertFails(getDoc(doc(firestore, 'rooms/ZX2C3D/players/other')))
	})

	it('denies all direct public writes', async () => {
		const firestore = environment.authenticatedContext('member').firestore()
		await assertFails(setDoc(doc(firestore, 'rooms/AB2C3D'), { phase: 'finished' }))
	})

	it('denies every secret read', async () => {
		const firestore = environment.authenticatedContext('member').firestore()
		await assertFails(
			getDoc(doc(firestore, 'roomSecrets/AB2C3D/players/member')),
		)
	})
})
```

- [ ] **Step 2: Verify the deny-all baseline makes the member test fail**

Keep the deny-all `firestore.rules` created in Task 1 unchanged for this run.

Run:

```bash
pnpm firebase:firestore:exec "pnpm vitest run --config vitest.firebase.config.ts"
```

Expected: the member-read test FAILS while denial tests pass.

- [ ] **Step 3: Implement member-only rules**

Replace `firestore.rules` with:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isRoomMember(roomId) {
      return signedIn()
        && exists(/databases/$(database)/documents/rooms/$(roomId)/players/$(request.auth.uid));
    }

    match /rooms/{roomId} {
      allow read: if isRoomMember(roomId);
      allow write: if false;

      match /players/{playerId} {
        allow read: if isRoomMember(roomId);
        allow write: if false;
      }

      match /guesses/{guessId} {
        allow read: if isRoomMember(roomId);
        allow write: if false;
      }
    }

    match /roomSecrets/{roomId}/{document=**} {
      allow read, write: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 4: Run rule tests**

Run:

```bash
pnpm firebase:firestore:exec "pnpm vitest run --config vitest.firebase.config.ts"
```

Expected: all rule tests PASS.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules src/lib/firebase/firestore.rules.test.ts
git commit -m "security: restrict online rooms to members"
```

---

### Task 8: Add online state to the existing game store

**Files:**
- Create: `src/lib/online/types.ts`
- Modify: `src/lib/stores/gameStore.test.ts:10-297`
- Modify: `src/lib/stores/gameStore.ts:3-189`

- [ ] **Step 1: Define public online types**

Create `src/lib/online/types.ts`:

```ts
export type OnlineRoomPhase = 'lobby' | 'guessing' | 'finished'
export type OnlineConnectionStatus =
	| 'idle'
	| 'connecting'
	| 'connected'
	| 'reconnecting'
	| 'error'

export interface OnlineRoom {
	id: string
	hostUid: string
	phase: OnlineRoomPhase
	digitCount: number
	maxPlayers: number
	playerOrder: string[]
	currentGuesserUid: string | null
	winnerUid: string | null
	turnNumber: number
}

export interface OnlinePlayer {
	uid: string
	name: string
	seat: number
	ready: boolean
	eliminated: boolean
}

export interface OnlineGuess {
	id: string
	turnNumber: number
	guesserUid: string
	targetUid: string
	guess: string
	correct: boolean
	correctDigits: number
	correctPositions: number
}

export interface OnlineSnapshot {
	room: OnlineRoom
	players: OnlinePlayer[]
	guesses: OnlineGuess[]
}

export interface OnlineGameState {
	status: OnlineConnectionStatus
	uid: string
	roomId: string
	room: OnlineRoom | null
	players: OnlinePlayer[]
	guesses: OnlineGuess[]
	error: string
}
```

- [ ] **Step 2: Write failing store tests**

Add:

```ts
it('initializes online mode without local multiplayer players', () => {
	gameStore.setMode('online')
	gameStore.startNewGame()

	let state: GameState
	gameStore.subscribe((value) => {
		state = value
	})()

	expect(state!.mode).toBe('online')
	expect(state!.players).toEqual([])
	expect(state!.online.status).toBe('idle')
})

it('applies online identity and snapshots through store actions', () => {
	gameStore.setOnlineIdentity('uid-1', 'AB2C3D')
	gameStore.applyOnlineSnapshot({
		room: {
			id: 'AB2C3D',
			hostUid: 'uid-1',
			phase: 'lobby',
			digitCount: 3,
			maxPlayers: 2,
			playerOrder: ['uid-1'],
			currentGuesserUid: null,
			winnerUid: null,
			turnNumber: 0,
		},
		players: [
			{ uid: 'uid-1', name: 'Ada', seat: 0, ready: false, eliminated: false },
		],
		guesses: [],
	})

	let state: GameState
	gameStore.subscribe((value) => {
		state = value
	})()

	expect(state!.online.status).toBe('connected')
	expect(state!.online.roomId).toBe('AB2C3D')
	expect(state!.online.players[0].name).toBe('Ada')
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm vitest run src/lib/stores/gameStore.test.ts
```

Expected: FAIL because online mode/state/actions do not exist.

- [ ] **Step 4: Extend the store**

Change `GameMode`:

```ts
export type GameMode = 'single' | 'multi' | 'online'
```

Add `online: OnlineGameState` to `GameState`, initialize it with:

```ts
const initialOnlineState: OnlineGameState = {
	status: 'idle',
	uid: '',
	roomId: '',
	room: null,
	players: [],
	guesses: [],
	error: '',
}
```

Add these actions to `createGameStore()`:

```ts
setOnlineStatus: (status: OnlineConnectionStatus, error = '') =>
	update((state) => ({
		...state,
		online: { ...state.online, status, error },
	})),
setOnlineIdentity: (uid: string, roomId: string) =>
	update((state) => ({
		...state,
		online: {
			...state.online,
			uid,
			roomId,
			status: 'connecting',
			error: '',
		},
	})),
applyOnlineSnapshot: (snapshot: OnlineSnapshot) =>
	update((state) => ({
		...state,
		online: {
			...state.online,
			status: 'connected',
			roomId: snapshot.room.id,
			room: snapshot.room,
			players: snapshot.players,
			guesses: snapshot.guesses,
			error: '',
		},
	})),
clearOnlineSession: () =>
	update((state) => ({
		...state,
		online: initialOnlineState,
	})),
```

In `startNewGame`, return local state unchanged when `mode === 'online'`; online restart is server-authoritative.

- [ ] **Step 5: Run store tests**

Run:

```bash
pnpm vitest run src/lib/stores/gameStore.test.ts
```

Expected: all existing and online store tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/online/types.ts src/lib/stores/gameStore.ts src/lib/stores/gameStore.test.ts
git commit -m "feat: add online room state to game store"
```

---

### Task 9: Build the Firebase browser service

**Files:**
- Create: `src/lib/firebase/client.ts`
- Create: `src/lib/services/onlineGameService.test.ts`
- Create: `src/lib/services/onlineGameService.ts`

- [ ] **Step 1: Write failing service tests**

Create `src/lib/services/onlineGameService.test.ts` with typed fake dependencies:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
	createOnlineGameService,
	decodeOnlineSnapshot,
	mapOnlineGameError,
	type OnlineGameDependencies,
} from './onlineGameService'
import type { OnlineSnapshot } from '$lib/online/types'

function createFakeDependencies(input: {
	uid: string
	callResult: unknown
	storage: Map<string, string>
}): OnlineGameDependencies & {
	call: ReturnType<typeof vi.fn>
} {
	const call = vi.fn(async () => input.callResult)
	return {
		call,
		ensureUser: vi.fn(async () => input.uid),
		subscribeRoom: vi.fn(
			(
				_roomId: string,
				onValue: (snapshot: OnlineSnapshot) => void,
			) => {
				onValue(decodeOnlineSnapshot(validRawSnapshot()))
				return vi.fn()
			},
		),
		getStoredRoomId: () => input.storage.get('number-guessing-room-id') ?? '',
		setStoredRoomId: (roomId: string) => {
			input.storage.set('number-guessing-room-id', roomId)
		},
		clearStoredRoomId: () => {
			input.storage.delete('number-guessing-room-id')
		},
	}
}

function validRawSnapshot(): {
	roomId: string
	room: Record<string, unknown>
	players: Array<{ id: string; data: Record<string, unknown> }>
	guesses: Array<{ id: string; data: Record<string, unknown> }>
} {
	return {
		roomId: 'AB2C3D',
		room: {
			hostUid: 'host',
			phase: 'lobby',
			digitCount: 3,
			maxPlayers: 2,
			playerOrder: ['host', 'p2'],
			currentGuesserUid: null,
			winnerUid: null,
			turnNumber: 0,
		},
		players: [
			{
				id: 'p2',
				data: {
					name: 'Lin',
					seat: 1,
					ready: false,
					eliminated: false,
				},
			},
			{
				id: 'host',
				data: {
					name: 'Ada',
					seat: 0,
					ready: false,
					eliminated: false,
				},
			},
		],
		guesses: [],
	}
}

it('maps stable callable reasons to friendly messages', () => {
	expect(mapOnlineGameError({ code: 'functions/not-found', message: 'ROOM_NOT_FOUND' }))
		.toBe('Room not found or expired.')
	expect(mapOnlineGameError({ code: 'functions/resource-exhausted', message: 'ROOM_FULL' }))
		.toBe('This room is full.')
})

it('authenticates before creating a room and stores the room id', async () => {
	const storage = new Map<string, string>()
	const dependencies = createFakeDependencies({
		uid: 'host',
		callResult: { roomId: 'AB2C3D' },
		storage,
	})
	const service = createOnlineGameService(dependencies)

	await expect(
		service.createRoom({ name: 'Ada', digitCount: 3, maxPlayers: 2 }),
	).resolves.toEqual({ uid: 'host', roomId: 'AB2C3D' })
	expect(storage.get('number-guessing-room-id')).toBe('AB2C3D')
})

it('clears a stale saved room without calling the backend', () => {
	const storage = new Map([['number-guessing-room-id', 'AB2C3D']])
	const dependencies = createFakeDependencies({
		uid: 'host',
		callResult: {},
		storage,
	})
	const service = createOnlineGameService(dependencies)

	service.clearSession()

	expect(storage.has('number-guessing-room-id')).toBe(false)
	expect(dependencies.call).not.toHaveBeenCalled()
})

it('strictly decodes and sorts public snapshots', () => {
	expect(decodeOnlineSnapshot(validRawSnapshot())).toEqual({
		room: expect.objectContaining({ id: 'AB2C3D' }),
		players: [
			expect.objectContaining({ uid: 'host', seat: 0 }),
			expect.objectContaining({ uid: 'p2', seat: 1 }),
		],
		guesses: [],
	})
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run src/lib/services/onlineGameService.test.ts
```

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Add lazy Firebase initialization**

Create `src/lib/firebase/client.ts`:

```ts
import { browser } from '$app/environment'
import {
	PUBLIC_FIREBASE_API_KEY,
	PUBLIC_FIREBASE_APP_ID,
	PUBLIC_FIREBASE_AUTH_DOMAIN,
	PUBLIC_FIREBASE_FUNCTIONS_REGION,
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	PUBLIC_FIREBASE_PROJECT_ID,
	PUBLIC_FIREBASE_STORAGE_BUCKET,
} from '$env/static/public'
import { getApp, getApps, initializeApp } from 'firebase/app'
import {
	browserLocalPersistence,
	connectAuthEmulator,
	getAuth,
	setPersistence,
} from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

let emulatorConnected = false

const useEmulators = import.meta.env.MODE === 'test'
const demoConfig = {
	apiKey: 'demo-api-key',
	authDomain: 'demo-number-guessing.firebaseapp.com',
	projectId: 'demo-number-guessing',
	storageBucket: 'demo-number-guessing.appspot.com',
	messagingSenderId: '100000000000',
	appId: '1:100000000000:web:0000000000000000000000',
}

export async function getFirebaseClient() {
	if (!browser) {
		throw new Error('FIREBASE_BROWSER_REQUIRED')
	}
	const config = {
		apiKey: PUBLIC_FIREBASE_API_KEY || (useEmulators ? demoConfig.apiKey : ''),
		authDomain:
			PUBLIC_FIREBASE_AUTH_DOMAIN || (useEmulators ? demoConfig.authDomain : ''),
		projectId:
			PUBLIC_FIREBASE_PROJECT_ID || (useEmulators ? demoConfig.projectId : ''),
		storageBucket:
			PUBLIC_FIREBASE_STORAGE_BUCKET || (useEmulators ? demoConfig.storageBucket : ''),
		messagingSenderId:
			PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
			(useEmulators ? demoConfig.messagingSenderId : ''),
		appId: PUBLIC_FIREBASE_APP_ID || (useEmulators ? demoConfig.appId : ''),
	}
	const required = [config.apiKey, config.authDomain, config.projectId, config.appId]
	if (required.some((value) => !value)) {
		throw new Error('FIREBASE_CONFIG_MISSING')
	}
	const app = getApps().length
		? getApp()
		: initializeApp(config)
	const auth = getAuth(app)
	const firestore = getFirestore(app)
	const functions = getFunctions(
		app,
		PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1',
	)
	await setPersistence(auth, browserLocalPersistence)
	if (useEmulators && !emulatorConnected) {
		connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
		connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
		connectFunctionsEmulator(functions, '127.0.0.1', 5001)
		emulatorConnected = true
	}
	return { auth, firestore, functions }
}
```

- [ ] **Step 4: Implement the typed service**

Create `src/lib/services/onlineGameService.ts` with the public contract and
injected SDK boundary:

```ts
import { signInAnonymously } from 'firebase/auth'
import {
	collection,
	doc,
	onSnapshot,
	orderBy,
	query,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseClient } from '$lib/firebase/client'
import type {
	OnlineGuess,
	OnlinePlayer,
	OnlineRoom,
	OnlineSnapshot,
} from '$lib/online/types'

export interface OnlineGameService {
	restoreSession(): Promise<{ uid: string; roomId: string } | null>
	createRoom(input: {
		name: string
		digitCount: number
		maxPlayers: number
	}): Promise<{ uid: string; roomId: string }>
	joinRoom(input: { name: string; roomId: string }): Promise<{ uid: string; roomId: string }>
	setSecret(input: { roomId: string; number: string }): Promise<void>
	startRoom(roomId: string): Promise<void>
	submitGuess(input: {
		roomId: string
		targetUid: string
		guess: string
		turnNumber: number
	}): Promise<void>
	leaveRoom(roomId: string): Promise<void>
	restartRoom(roomId: string): Promise<void>
	clearSession(): void
	subscribeToRoom(
		roomId: string,
		onValue: (snapshot: OnlineSnapshot) => void,
		onError: (message: string) => void,
	): () => void
}

interface RawSnapshot {
	roomId: string
	room: Record<string, unknown>
	players: Array<{ id: string; data: Record<string, unknown> }>
	guesses: Array<{ id: string; data: Record<string, unknown> }>
}

export interface OnlineGameDependencies {
	ensureUser(): Promise<string>
	call(name: string, input: Record<string, unknown>): Promise<unknown>
	subscribeRoom(
		roomId: string,
		onValue: (snapshot: OnlineSnapshot) => void,
		onError: (message: string) => void,
	): () => void
	getStoredRoomId(): string
	setStoredRoomId(roomId: string): void
	clearStoredRoomId(): void
}

const messages: Record<string, string> = {
	AUTH_REQUIRED: 'Could not sign in. Please retry.',
	NAME_INVALID: 'Enter a name between 1 and 20 characters.',
	DIGIT_COUNT_INVALID: 'Choose between two and five digits.',
	PLAYER_COUNT_INVALID: 'Choose between two and four players.',
	ROOM_ID_INVALID: 'Enter a valid six-character room ID.',
	ROOM_NOT_FOUND: 'Room not found or expired.',
	ROOM_FULL: 'This room is full.',
	ROOM_ALREADY_STARTED: 'This room has already started.',
	ROOM_MEMBERSHIP_REQUIRED: 'Room not found or expired.',
	HOST_REQUIRED: 'Only the host can do that.',
	ROOM_NOT_READY: 'The room is not ready to start.',
	ROOM_NOT_GUESSING: 'This game is not accepting guesses.',
	ROOM_NOT_FINISHED: 'The game must finish before restarting.',
	ACTIVE_MATCH_LEAVE_DENIED: 'You cannot leave during an active match.',
	GUESS_INVALID: 'Enter a number with the configured digit count.',
	GUESS_INPUT_INVALID: 'Enter a valid guess and target.',
	TURN_STALE: 'The turn changed. Try again.',
	TARGET_INVALID: 'Choose an active opponent.',
	TARGET_ELIMINATED: 'That player has already been eliminated.',
	ONLINE_GAME_INTERNAL: 'Something went wrong. Please retry.',
}

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('ONLINE_SNAPSHOT_INVALID')
	}
	return value as Record<string, unknown>
}

function string(value: unknown): string {
	if (typeof value !== 'string') {
		throw new Error('ONLINE_SNAPSHOT_INVALID')
	}
	return value
}

function nullableString(value: unknown): string | null {
	if (value === null) {
		return null
	}
	return string(value)
}

function number(value: unknown): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		throw new Error('ONLINE_SNAPSHOT_INVALID')
	}
	return value
}

function boolean(value: unknown): boolean {
	if (typeof value !== 'boolean') {
		throw new Error('ONLINE_SNAPSHOT_INVALID')
	}
	return value
}

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
		throw new Error('ONLINE_SNAPSHOT_INVALID')
	}
	return [...value]
}

function decodeRoom(id: string, value: unknown): OnlineRoom {
	const data = record(value)
	const phase = string(data.phase)
	if (phase !== 'lobby' && phase !== 'guessing' && phase !== 'finished') {
		throw new Error('ONLINE_SNAPSHOT_INVALID')
	}
	return {
		id,
		hostUid: string(data.hostUid),
		phase,
		digitCount: number(data.digitCount),
		maxPlayers: number(data.maxPlayers),
		playerOrder: stringArray(data.playerOrder),
		currentGuesserUid: nullableString(data.currentGuesserUid),
		winnerUid: nullableString(data.winnerUid),
		turnNumber: number(data.turnNumber),
	}
}

function decodePlayer(id: string, value: unknown): OnlinePlayer {
	const data = record(value)
	return {
		uid: id,
		name: string(data.name),
		seat: number(data.seat),
		ready: boolean(data.ready),
		eliminated: boolean(data.eliminated),
	}
}

function decodeGuess(id: string, value: unknown): OnlineGuess {
	const data = record(value)
	return {
		id,
		turnNumber: number(data.turnNumber),
		guesserUid: string(data.guesserUid),
		targetUid: string(data.targetUid),
		guess: string(data.guess),
		correct: boolean(data.correct),
		correctDigits: number(data.correctDigits),
		correctPositions: number(data.correctPositions),
	}
}

export function decodeOnlineSnapshot(raw: RawSnapshot): OnlineSnapshot {
	return {
		room: decodeRoom(raw.roomId, raw.room),
		players: raw.players
			.map((player) => decodePlayer(player.id, player.data))
			.sort((left, right) => left.seat - right.seat),
		guesses: raw.guesses
			.map((guess) => decodeGuess(guess.id, guess.data))
			.sort((left, right) => left.turnNumber - right.turnNumber),
	}
}

export function mapOnlineGameError(error: unknown): string {
	if (!error || typeof error !== 'object' || Array.isArray(error)) {
		return messages.ONLINE_GAME_INTERNAL
	}
	const data = error as Record<string, unknown>
	const code = typeof data.code === 'string' ? data.code : ''
	if (code.endsWith('/unavailable') || code === 'unavailable') {
		return 'Connection interrupted. Reconnecting…'
	}
	if (code.endsWith('/aborted') || code === 'aborted') {
		return 'The room changed. Please retry.'
	}
	const message = typeof data.message === 'string' ? data.message : ''
	const reason = Object.keys(messages).find((key) => message.includes(key))
	return reason ? messages[reason] : messages.ONLINE_GAME_INTERNAL
}

function roomIdResult(value: unknown): string {
	return string(record(value).roomId)
}

function commandError(error: unknown): Error {
	return new Error(mapOnlineGameError(error))
}

export function createOnlineGameService(
	dependencies: OnlineGameDependencies,
): OnlineGameService {
	async function ensureUser(): Promise<string> {
		try {
			return await dependencies.ensureUser()
		} catch (error) {
			throw commandError(error)
		}
	}

	async function run(
		name: string,
		input: Record<string, unknown>,
	): Promise<unknown> {
		await ensureUser()
		try {
			return await dependencies.call(name, input)
		} catch (error) {
			throw commandError(error)
		}
	}

	return {
		async restoreSession() {
			const roomId = dependencies.getStoredRoomId()
			if (!roomId) {
				return null
			}
			return { uid: await ensureUser(), roomId }
		},
		async createRoom(input) {
			const uid = await ensureUser()
			const roomId = roomIdResult(await run('createRoom', input))
			dependencies.setStoredRoomId(roomId)
			return { uid, roomId }
		},
		async joinRoom(input) {
			const uid = await ensureUser()
			const normalized = { ...input, roomId: input.roomId.trim().toUpperCase() }
			const roomId = roomIdResult(await run('joinRoom', normalized))
			dependencies.setStoredRoomId(roomId)
			return { uid, roomId }
		},
		async setSecret(input) {
			await run('setSecret', input)
		},
		async startRoom(roomId) {
			await run('startRoom', { roomId })
		},
		async submitGuess(input) {
			await run('submitGuess', input)
		},
		async leaveRoom(roomId) {
			await run('leaveRoom', { roomId })
			dependencies.clearStoredRoomId()
		},
		async restartRoom(roomId) {
			await run('restartRoom', { roomId })
		},
		clearSession() {
			dependencies.clearStoredRoomId()
		},
		subscribeToRoom(roomId, onValue, onError) {
			return dependencies.subscribeRoom(roomId, onValue, onError)
		},
	}
}
```

Append the Firebase adapter and default service:

```ts
async function ensureFirebaseUser(): Promise<string> {
	const { auth } = await getFirebaseClient()
	await auth.authStateReady()
	if (auth.currentUser) {
		return auth.currentUser.uid
	}
	return (await signInAnonymously(auth)).user.uid
}

async function callFirebase(
	name: string,
	input: Record<string, unknown>,
): Promise<unknown> {
	const { functions } = await getFirebaseClient()
	return (await httpsCallable<Record<string, unknown>, unknown>(functions, name)(input))
		.data
}

function subscriptionMessage(error: unknown): string {
	if (
		error &&
		typeof error === 'object' &&
		'code' in error &&
		error.code === 'permission-denied'
	) {
		return 'Room not found or expired.'
	}
	return mapOnlineGameError(error)
}

function subscribeFirebaseRoom(
	roomId: string,
	onValue: (snapshot: OnlineSnapshot) => void,
	onError: (message: string) => void,
): () => void {
	let room: Record<string, unknown> | null = null
	let players: RawSnapshot['players'] = []
	let guesses: RawSnapshot['guesses'] = []
	let cancelled = false
	const unsubscribers: Array<() => void> = []

	function emit(): void {
		if (room) {
			onValue(decodeOnlineSnapshot({ roomId, room, players, guesses }))
		}
	}

	void getFirebaseClient()
		.then(({ firestore }) => {
			const subscriptions = [
				onSnapshot(
					doc(firestore, 'rooms', roomId),
					(snapshot) => {
						if (!snapshot.exists()) {
							onError('Room not found or expired.')
							return
						}
						room = snapshot.data()
						emit()
					},
					(error) => onError(subscriptionMessage(error)),
				),
				onSnapshot(
					query(
						collection(firestore, 'rooms', roomId, 'players'),
						orderBy('seat'),
					),
					(snapshot) => {
						players = snapshot.docs.map((item) => ({
							id: item.id,
							data: item.data(),
						}))
						emit()
					},
					(error) => onError(subscriptionMessage(error)),
				),
				onSnapshot(
					query(
						collection(firestore, 'rooms', roomId, 'guesses'),
						orderBy('turnNumber'),
					),
					(snapshot) => {
						guesses = snapshot.docs.map((item) => ({
							id: item.id,
							data: item.data(),
						}))
						emit()
					},
					(error) => onError(subscriptionMessage(error)),
				),
			]
			if (cancelled) {
				subscriptions.forEach((unsubscribe) => unsubscribe())
				return
			}
			unsubscribers.push(...subscriptions)
		})
		.catch((error: unknown) => {
			if (!cancelled) {
				onError(mapOnlineGameError(error))
			}
		})

	return () => {
		cancelled = true
		unsubscribers.forEach((unsubscribe) => unsubscribe())
	}
}

const firebaseDependencies: OnlineGameDependencies = {
	ensureUser: ensureFirebaseUser,
	call: callFirebase,
	subscribeRoom: subscribeFirebaseRoom,
	getStoredRoomId: () =>
		typeof localStorage === 'undefined'
			? ''
			: localStorage.getItem('number-guessing-room-id') ?? '',
	setStoredRoomId: (roomId) => {
		localStorage.setItem('number-guessing-room-id', roomId)
	},
	clearStoredRoomId: () => {
		localStorage.removeItem('number-guessing-room-id')
	},
}

export const onlineGameService = createOnlineGameService(firebaseDependencies)
```

- [ ] **Step 5: Run service tests and type checks**

Run:

```bash
pnpm vitest run src/lib/services/onlineGameService.test.ts
pnpm check
```

Expected: service tests PASS; Svelte/TypeScript checks exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/firebase/client.ts src/lib/services/onlineGameService.ts src/lib/services/onlineGameService.test.ts
git commit -m "feat: add Firebase online game client"
```

---

### Task 10: Build entry and lobby UI with component tests

**Files:**
- Modify: `src/app.css`
- Modify: `README.md`
- Create: `src/lib/components/OnlineMultiplayerGame.test.ts`
- Create: `src/lib/components/OnlineMultiplayerGame.svelte`

- [ ] **Step 1: Document the surface, then define its existing tokens**

Before editing the component, add this row to the README Design system file map:

```md
| Online entry, lobby, synchronized game, reconnect, and result states | `src/lib/components/OnlineMultiplayerGame.svelte` |
```

Add this component contract beside the existing component table:

```md
| Online multiplayer | One cream-panel flow: name/create/join entry, room-ID lobby with readiness, turn/guess state, reconnect status, and host restart |
```

Add the existing README tokens to `:root` in `src/app.css`:

```css
:root {
	--stage-border: #0b1220;
	--glass-bg: #f5efe6;
	--glass-border: #0b1220;
	--glass-fg: #0b1220;
	--glass-muted: #5b6478;
	--glass-accent: #facc15;
	--accent-blue: #2563eb;
	--accent-purple: #a855f7;
	--accent-purple-fg: #ffffff;
	--state-correct: #22c55e;
	--state-incorrect: #ef4444;
	--state-warning: #f59e0b;
	--state-info: #3b82f6;
}
```

- [ ] **Step 2: Write failing entry/lobby component tests**

Create `src/lib/components/OnlineMultiplayerGame.test.ts` with:

```ts
import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import OnlineMultiplayerGame from './OnlineMultiplayerGame.svelte'
import { gameStore } from '$lib/stores/gameStore'
import type { OnlineSnapshot } from '$lib/online/types'
import type { OnlineGameService } from '$lib/services/onlineGameService'

function createFakeOnlineGameService(input?: {
	createRoomResult?: { uid: string; roomId: string }
	joinRoomResult?: { uid: string; roomId: string }
	restoreSessionResult?: { uid: string; roomId: string } | null
}): OnlineGameService {
	return {
		restoreSession: vi.fn(async () => input?.restoreSessionResult ?? null),
		createRoom: vi.fn(async () =>
			input?.createRoomResult ?? { uid: 'host', roomId: 'AB2C3D' },
		),
		joinRoom: vi.fn(async () =>
			input?.joinRoomResult ?? { uid: 'p2', roomId: 'AB2C3D' },
		),
		setSecret: vi.fn(async () => undefined),
		startRoom: vi.fn(async () => undefined),
		submitGuess: vi.fn(async () => undefined),
		leaveRoom: vi.fn(async () => undefined),
		restartRoom: vi.fn(async () => undefined),
		clearSession: vi.fn(),
		subscribeToRoom: vi.fn(() => vi.fn()),
	}
}

function readyLobbySnapshot(hostReady = true): OnlineSnapshot {
	return {
		room: {
			id: 'AB2C3D',
			hostUid: 'host',
			phase: 'lobby',
			digitCount: 3,
			maxPlayers: 2,
			playerOrder: ['host', 'p2'],
			currentGuesserUid: null,
			winnerUid: null,
			turnNumber: 0,
		},
		players: [
			{ uid: 'host', name: 'Ada', seat: 0, ready: hostReady, eliminated: false },
			{ uid: 'p2', name: 'Lin', seat: 1, ready: true, eliminated: false },
		],
		guesses: [],
	}
}

beforeEach(() => {
	gameStore.reset()
	gameStore.setMode('online')
	gameStore.updateSettings({ digitCount: 3, playerCount: 2 })
})

it('creates a room from the entered name', async () => {
	const service = createFakeOnlineGameService({
		createRoomResult: { uid: 'host', roomId: 'AB2C3D' },
	})
	const user = userEvent.setup()
	render(OnlineMultiplayerGame, { props: { service } })

	await user.type(screen.getByLabelText('Display name'), 'Ada')
	await user.click(screen.getByRole('button', { name: 'Create Room' }))

	expect(service.createRoom).toHaveBeenCalledWith({
		name: 'Ada',
		digitCount: 3,
		maxPlayers: 2,
	})
})

it('normalizes and joins a room', async () => {
	const service = createFakeOnlineGameService({
		joinRoomResult: { uid: 'p2', roomId: 'AB2C3D' },
	})
	const user = userEvent.setup()
	render(OnlineMultiplayerGame, { props: { service } })

	await user.type(screen.getByLabelText('Display name'), 'Lin')
	await user.type(screen.getByLabelText('Room ID'), 'ab2c3d')
	await user.click(screen.getByRole('button', { name: 'Join Room' }))

	expect(service.joinRoom).toHaveBeenCalledWith({
		name: 'Lin',
		roomId: 'AB2C3D',
	})
})

it('shows lobby readiness and lets the host start', async () => {
	const service = createFakeOnlineGameService()
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	const user = userEvent.setup()
	render(OnlineMultiplayerGame, { props: { service } })

	expect(screen.getByText('Room AB2C3D')).toBeInTheDocument()
	expect(screen.getByText('2 / 2 players')).toBeInTheDocument()
	await user.type(screen.getByLabelText('Secret number'), '123')
	await user.click(screen.getByRole('button', { name: 'Ready' }))
	gameStore.applyOnlineSnapshot(readyLobbySnapshot())
	await user.click(screen.getByRole('button', { name: 'Start Game' }))

	expect(service.setSecret).toHaveBeenCalledWith({
		roomId: 'AB2C3D',
		number: '123',
	})
	expect(service.startRoom).toHaveBeenCalledWith('AB2C3D')
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
pnpm vitest run src/lib/components/OnlineMultiplayerGame.test.ts
```

Expected: FAIL because the component does not exist.

- [ ] **Step 4: Implement entry and lobby states**

Create `OnlineMultiplayerGame.svelte` with an optional service prop for tests:

```svelte
<script lang="ts">
	import { gameStore } from '$lib/stores/gameStore'
	import {
		onlineGameService,
		type OnlineGameService,
	} from '$lib/services/onlineGameService'

	interface Props {
		service?: OnlineGameService
	}

	let { service = onlineGameService }: Props = $props()
	let name = $state('')
	let roomIdInput = $state('')
	let secret = $state('')
	let busy = $state(false)
	const room = $derived($gameStore.online.room)
	const currentPlayer = $derived(
		$gameStore.online.players.find((player) => player.uid === $gameStore.online.uid),
	)
	const canStart = $derived(
		room !== null &&
			room.hostUid === $gameStore.online.uid &&
			$gameStore.online.players.length === room.maxPlayers &&
			$gameStore.online.players.every((player) => player.ready),
	)

	function errorMessage(error: unknown): string {
		return error instanceof Error ? error.message : 'Something went wrong. Please retry.'
	}

	function reportError(error: unknown): void {
		const message = errorMessage(error)
		if (message === 'Connection interrupted. Reconnecting…') {
			gameStore.setOnlineStatus('reconnecting')
			return
		}
		gameStore.setOnlineStatus('error', message)
	}

	async function createRoom() {
		busy = true
		gameStore.setOnlineStatus('connecting')
		try {
			const session = await service.createRoom({
				name,
				digitCount: $gameStore.settings.digitCount,
				maxPlayers: $gameStore.settings.playerCount,
			})
			gameStore.setOnlineIdentity(session.uid, session.roomId)
		} catch (error) {
			reportError(error)
		} finally {
			busy = false
		}
	}

	async function joinRoom() {
		busy = true
		gameStore.setOnlineStatus('connecting')
		try {
			const session = await service.joinRoom({
				name,
				roomId: roomIdInput.trim().toUpperCase(),
			})
			gameStore.setOnlineIdentity(session.uid, session.roomId)
		} catch (error) {
			reportError(error)
		} finally {
			busy = false
		}
	}

	async function setSecret() {
		busy = true
		try {
			await service.setSecret({
				roomId: $gameStore.online.roomId,
				number: secret,
			})
			secret = ''
		} catch (error) {
			reportError(error)
		} finally {
			busy = false
		}
	}

	async function startRoom() {
		if (!room) {
			return
		}
		busy = true
		try {
			await service.startRoom(room.id)
		} catch (error) {
			reportError(error)
		} finally {
			busy = false
		}
	}

	async function leaveRoom() {
		if (!room) {
			return
		}
		busy = true
		try {
			await service.leaveRoom(room.id)
			gameStore.clearOnlineSession()
		} catch (error) {
			reportError(error)
		} finally {
			busy = false
		}
	}

	async function copyRoomId() {
		if (room) {
			await navigator.clipboard.writeText(room.id)
		}
	}

	$effect(() => {
		const roomId = $gameStore.online.roomId
		if (!roomId) {
			return
		}
		return service.subscribeToRoom(
			roomId,
			(snapshot) => gameStore.applyOnlineSnapshot(snapshot),
			(message) => {
				if (message === 'Room not found or expired.') {
					service.clearSession()
					gameStore.clearOnlineSession()
					gameStore.setOnlineStatus('error', message)
					return
				}
				gameStore.setOnlineStatus('reconnecting')
			},
		)
	})
</script>

{#if $gameStore.online.error}
	<p
		role="alert"
		class="mb-4 rounded-lg border border-[var(--state-incorrect)] p-3 text-[var(--glass-fg)]"
	>
		{$gameStore.online.error}
	</p>
{/if}

{#if !room}
	<section aria-labelledby="online-entry-heading" class="space-y-5 text-[var(--glass-fg)]">
		<div>
			<p class="text-sm uppercase tracking-widest text-[var(--glass-muted)]">
				Online Multiplayer
			</p>
			<h2 id="online-entry-heading" class="text-3xl font-bold">
				Play with <em class="text-[var(--glass-accent)]">friends.</em>
			</h2>
		</div>

		<label class="block space-y-2">
			<span>Display name</span>
			<input
				bind:value={name}
				disabled={busy}
				maxlength="20"
				class="w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3"
			/>
		</label>

		<div class="grid gap-3 sm:grid-cols-2">
			<button
				type="button"
				onclick={createRoom}
				disabled={busy || !name.trim()}
				class="rounded-lg border border-[var(--glass-border)] bg-[var(--accent-purple)] p-3 font-bold text-[var(--accent-purple-fg)] disabled:opacity-50"
			>
				Create Room
			</button>
			<div class="space-y-2">
				<label class="block space-y-2">
					<span>Room ID</span>
					<input
						bind:value={roomIdInput}
						disabled={busy}
						maxlength="6"
						class="w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3 uppercase"
					/>
				</label>
				<button
					type="button"
					onclick={joinRoom}
					disabled={busy || !name.trim() || roomIdInput.trim().length !== 6}
					class="w-full rounded-lg border border-[var(--glass-border)] bg-[var(--accent-blue)] p-3 font-bold text-[var(--accent-purple-fg)] disabled:opacity-50"
				>
					Join Room
				</button>
			</div>
		</div>
		<p aria-live="polite" class="text-sm text-[var(--glass-muted)]">
			{busy ? 'Connecting…' : 'Create a room or enter the ID from another player.'}
		</p>
	</section>
{:else if room.phase === 'lobby'}
	<section aria-labelledby="online-lobby-heading" class="space-y-5 text-[var(--glass-fg)]">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div>
				<p class="text-sm uppercase tracking-widest text-[var(--glass-muted)]">Lobby</p>
				<h2 id="online-lobby-heading" class="text-3xl font-bold">
					Room <span data-testid="room-id">{room.id}</span>
				</h2>
			</div>
			<button
				type="button"
				onclick={copyRoomId}
				class="rounded-lg border border-[var(--glass-border)] px-3 py-2"
			>
				Copy Room ID
			</button>
		</div>

		<p>{`${$gameStore.online.players.length} / ${room.maxPlayers} players`}</p>
		<ul class="space-y-2">
			{#each $gameStore.online.players as player (player.uid)}
				<li
					class="flex items-center justify-between rounded-lg border border-[var(--glass-border)] p-3"
				>
					<span>
						{player.name}
						{#if player.uid === room.hostUid}
							<small>(Host)</small>
						{/if}
					</span>
					<span>{player.ready ? 'Ready' : 'Waiting'}</span>
				</li>
			{/each}
		</ul>

		{#if currentPlayer}
			<label class="block space-y-2">
				<span>Secret number</span>
				<input
					bind:value={secret}
					disabled={busy}
					inputmode="numeric"
					maxlength={room.digitCount}
					class="w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3"
				/>
			</label>
			<button
				type="button"
				onclick={setSecret}
				disabled={busy || secret.length !== room.digitCount}
				class="rounded-lg border border-[var(--glass-border)] bg-[var(--accent-purple)] px-4 py-3 font-bold text-[var(--accent-purple-fg)] disabled:opacity-50"
			>
				{currentPlayer.ready ? 'Update Secret' : 'Ready'}
			</button>
			{#if currentPlayer.ready}
				<p aria-live="polite">Your secret is ready. Enter another number to replace it.</p>
			{/if}
		{/if}

		<div class="flex flex-wrap gap-3">
			{#if room.hostUid === $gameStore.online.uid}
				<button
					type="button"
					onclick={startRoom}
					disabled={busy || !canStart}
					class="rounded-lg border border-[var(--glass-border)] bg-[var(--accent-blue)] px-4 py-3 font-bold text-[var(--accent-purple-fg)] disabled:opacity-50"
				>
					Start Game
				</button>
			{/if}
			<button
				type="button"
				onclick={leaveRoom}
				disabled={busy}
				class="rounded-lg border border-[var(--glass-border)] px-4 py-3"
			>
				Leave Room
			</button>
		</div>
	</section>
{/if}
```

- [ ] **Step 5: Run component tests**

Run:

```bash
pnpm vitest run src/lib/components/OnlineMultiplayerGame.test.ts
pnpm check
```

Expected: entry and lobby tests PASS; type checks exit 0.

- [ ] **Step 6: Commit**

```bash
git add README.md src/app.css src/lib/components/OnlineMultiplayerGame.svelte src/lib/components/OnlineMultiplayerGame.test.ts
git commit -m "feat: add online room entry and lobby"
```

---

### Task 11: Add guessing, finished, reconnect, and error UI

**Files:**
- Modify: `src/lib/components/OnlineMultiplayerGame.test.ts`
- Modify: `src/lib/components/OnlineMultiplayerGame.svelte`

- [ ] **Step 1: Write failing game-state tests**

Change the Testing Library import to:

```ts
import { render, screen, waitFor } from '@testing-library/svelte'
```

Add these fixtures and tests:

```ts
function guessingSnapshot(input: {
	currentGuesserUid: string
	turnNumber?: number
}): OnlineSnapshot {
	return {
		room: {
			id: 'AB2C3D',
			hostUid: 'host',
			phase: 'guessing',
			digitCount: 3,
			maxPlayers: 2,
			playerOrder: ['host', 'p2'],
			currentGuesserUid: input.currentGuesserUid,
			winnerUid: null,
			turnNumber: input.turnNumber ?? 0,
		},
		players: [
			{ uid: 'host', name: 'Ada', seat: 0, ready: true, eliminated: false },
			{ uid: 'p2', name: 'Lin', seat: 1, ready: true, eliminated: false },
		],
		guesses: [],
	}
}

function finishedSnapshot(input: { winnerUid: string }): OnlineSnapshot {
	const snapshot = guessingSnapshot({ currentGuesserUid: input.winnerUid, turnNumber: 1 })
	return {
		...snapshot,
		room: {
			...snapshot.room,
			phase: 'finished',
			currentGuesserUid: null,
			winnerUid: input.winnerUid,
		},
		players: snapshot.players.map((player) => ({
			...player,
			eliminated: player.uid !== input.winnerUid,
		})),
		guesses: [
			{
				id: 'turn-1',
				turnNumber: 1,
				guesserUid: input.winnerUid,
				targetUid: input.winnerUid === 'host' ? 'p2' : 'host',
				guess: '456',
				correct: true,
				correctDigits: 3,
				correctPositions: 3,
			},
		],
	}
}

it('enables guessing only for the active player', async () => {
	const service = createFakeOnlineGameService()
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(guessingSnapshot({ currentGuesserUid: 'host' }))
	const user = userEvent.setup()
	render(OnlineMultiplayerGame, { props: { service } })

	await user.selectOptions(screen.getByLabelText('Target player'), 'p2')
	await user.type(screen.getByLabelText('Guess'), '456')
	await user.click(screen.getByRole('button', { name: 'Submit Guess' }))

	expect(service.submitGuess).toHaveBeenCalledWith({
		roomId: 'AB2C3D',
		targetUid: 'p2',
		guess: '456',
		turnNumber: 0,
	})
})

it('shows a waiting state for another player turn', () => {
	gameStore.setOnlineIdentity('p2', 'AB2C3D')
	gameStore.applyOnlineSnapshot(guessingSnapshot({ currentGuesserUid: 'host' }))
	render(OnlineMultiplayerGame, { props: { service: createFakeOnlineGameService() } })

	expect(screen.getByText("Ada's turn")).toBeInTheDocument()
	expect(screen.getByLabelText('Guess')).toBeDisabled()
})

it('shows the winner and host restart action', async () => {
	const service = createFakeOnlineGameService()
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(finishedSnapshot({ winnerUid: 'host' }))
	const user = userEvent.setup()
	render(OnlineMultiplayerGame, { props: { service } })

	expect(screen.getByText('Ada wins!')).toBeInTheDocument()
	await user.click(screen.getByRole('button', { name: 'Play Again' }))
	expect(service.restartRoom).toHaveBeenCalledWith('AB2C3D')
})

it('restores a saved room and clears an expired saved session', async () => {
	const service = createFakeOnlineGameService({
		restoreSessionResult: { uid: 'host', roomId: 'AB2C3D' },
	})
	render(OnlineMultiplayerGame, { props: { service } })

	await waitFor(() => {
		expect(service.subscribeToRoom).toHaveBeenCalledWith(
			'AB2C3D',
			expect.any(Function),
			expect.any(Function),
		)
	})

	const onError = vi.mocked(service.subscribeToRoom).mock.calls[0][2]
	onError('Connection interrupted.')
	expect(screen.getByText('Reconnecting…')).toBeInTheDocument()

	onError('Room not found or expired.')

	expect(service.clearSession).toHaveBeenCalled()
	expect(screen.getByRole('alert')).toHaveTextContent('Room not found or expired.')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run src/lib/components/OnlineMultiplayerGame.test.ts
```

Expected: new guessing, finished, and reconnect tests FAIL.

- [ ] **Step 3: Implement the remaining states**

Add these states, derived values, actions, and restore effect below the existing
lobby state:

```ts
let guess = $state('')
let targetUid = $state('')
let restoreStarted = $state(false)

const currentGuesser = $derived(
	$gameStore.online.players.find(
		(player) => player.uid === $gameStore.online.room?.currentGuesserUid,
	),
)
const activeTargets = $derived(
	$gameStore.online.players.filter(
		(player) => player.uid !== $gameStore.online.uid && !player.eliminated,
	),
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

async function submitGuess() {
	if (!room || !targetUid) {
		return
	}
	busy = true
	try {
		await service.submitGuess({
			roomId: room.id,
			targetUid,
			guess,
			turnNumber: room.turnNumber,
		})
		guess = ''
	} catch (error) {
		reportError(error)
	} finally {
		busy = false
	}
}

async function restartRoom() {
	if (!room) {
		return
	}
	busy = true
	try {
		await service.restartRoom(room.id)
	} catch (error) {
		reportError(error)
	} finally {
		busy = false
	}
}

$effect(() => {
	if (restoreStarted || $gameStore.online.roomId) {
		return
	}
	restoreStarted = true
	void service
		.restoreSession()
		.then((session) => {
			if (session) {
				gameStore.setOnlineIdentity(session.uid, session.roomId)
			}
		})
		.catch((error: unknown) => {
			reportError(error)
		})
})
```

Add this status region immediately after the existing error banner:

```svelte
{#if $gameStore.online.status === 'reconnecting'}
	<p aria-live="polite" class="mb-4 text-[var(--state-warning)]">Reconnecting…</p>
{/if}
```

Replace the final `{/if}` after the lobby section with the guessing and
finished branches:

```svelte
{:else if room.phase === 'guessing'}
	<section aria-labelledby="online-game-heading" class="space-y-5 text-[var(--glass-fg)]">
		<div>
			<p class="text-sm uppercase tracking-widest text-[var(--glass-muted)]">
				Room {room.id}
			</p>
			<h2 id="online-game-heading" class="text-3xl font-bold">
				{currentGuesser?.name ?? 'Player'}'s turn
			</h2>
		</div>

		<ul class="grid gap-2 sm:grid-cols-2">
			{#each $gameStore.online.players as player (player.uid)}
				<li
					class="rounded-lg border border-[var(--glass-border)] p-3"
					class:opacity-50={player.eliminated}
				>
					<strong>{player.name}</strong>
					<span class="ml-2">{player.eliminated ? 'Eliminated' : 'Active'}</span>
				</li>
			{/each}
		</ul>

		<label class="block space-y-2">
			<span>Target player</span>
			<select
				bind:value={targetUid}
				disabled={!canGuess || busy}
				class="w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3"
			>
				<option value="">Choose a player</option>
				{#each activeTargets as player (player.uid)}
					<option value={player.uid}>{player.name}</option>
				{/each}
			</select>
		</label>
		<label class="block space-y-2">
			<span>Guess</span>
			<input
				bind:value={guess}
				disabled={!canGuess || busy}
				inputmode="numeric"
				maxlength={room.digitCount}
				class="w-full rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3"
			/>
		</label>
		<button
			type="button"
			onclick={submitGuess}
			disabled={!canGuess || busy || !targetUid || guess.length !== room.digitCount}
			class="rounded-lg border border-[var(--glass-border)] bg-[var(--accent-purple)] px-4 py-3 font-bold text-[var(--accent-purple-fg)] disabled:opacity-50"
		>
			Submit Guess
		</button>

		<h3 class="text-xl font-bold">Guess history</h3>
		{#if $gameStore.online.guesses.length === 0}
			<p class="text-[var(--glass-muted)]">No guesses yet.</p>
		{:else}
			<ol class="space-y-2">
				{#each $gameStore.online.guesses as entry (entry.id)}
					<li class="rounded-lg border border-[var(--glass-border)] p-3">
						<strong>
							{$gameStore.online.players.find((player) => player.uid === entry.guesserUid)
								?.name ?? 'Player'}
						</strong>
						guessed {entry.guess} for
						{$gameStore.online.players.find((player) => player.uid === entry.targetUid)
							?.name ?? 'Player'}:
						{entry.correctDigits} digits, {entry.correctPositions} positions
					</li>
				{/each}
			</ol>
		{/if}
	</section>
{:else}
	<section aria-labelledby="online-finished-heading" class="space-y-5 text-[var(--glass-fg)]">
		<p class="text-sm uppercase tracking-widest text-[var(--glass-muted)]">
			Room {room.id}
		</p>
		<h2 id="online-finished-heading" class="text-3xl font-bold">
			{winner?.name ?? 'Player'} wins!
		</h2>
		{#if room.hostUid === $gameStore.online.uid}
			<button
				type="button"
				onclick={restartRoom}
				disabled={busy}
				class="rounded-lg border border-[var(--glass-border)] bg-[var(--accent-purple)] px-4 py-3 font-bold text-[var(--accent-purple-fg)] disabled:opacity-50"
			>
				Play Again
			</button>
		{:else}
			<p aria-live="polite">Waiting for the host to restart.</p>
		{/if}
		<button
			type="button"
			onclick={leaveRoom}
			disabled={busy}
			class="rounded-lg border border-[var(--glass-border)] px-4 py-3"
		>
			Leave Room
		</button>
	</section>
{/if}
```

- [ ] **Step 4: Run tests and checks**

Run:

```bash
pnpm vitest run src/lib/components/OnlineMultiplayerGame.test.ts
pnpm check
```

Expected: all online component tests PASS and checks exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/OnlineMultiplayerGame.svelte src/lib/components/OnlineMultiplayerGame.test.ts
git commit -m "feat: add synchronized online game states"
```

---

### Task 12: Integrate Online Multiplayer into settings and the page

**Files:**
- Modify: `src/lib/components/SettingsModal.test.ts:46-193`
- Modify: `src/lib/components/SettingsModal.svelte:10-105`
- Modify: `src/routes/page.test.ts:58-145`
- Modify: `src/routes/+page.svelte:3-69`

- [ ] **Step 1: Write failing settings and page tests**

Add:

```ts
it('offers local and online multiplayer separately', () => {
	render(SettingsModal, { props: { onclose: vi.fn() } })
	const mode = screen.getByLabelText('Game Mode:')
	expect(mode).toHaveDisplayValue('Single Player')
	expect(screen.getByRole('option', { name: 'Local Multiplayer' })).toBeInTheDocument()
	expect(screen.getByRole('option', { name: 'Online Multiplayer' })).toBeInTheDocument()
})

it('shows player count for online multiplayer', async () => {
	const user = userEvent.setup()
	render(SettingsModal, { props: { onclose: vi.fn() } })
	await user.selectOptions(screen.getByLabelText('Game Mode:'), 'online')
	expect(screen.getByLabelText('Number of Players:')).toBeInTheDocument()
})
```

Add to `page.test.ts`:

```ts
it('renders OnlineMultiplayerGame in online mode', () => {
	gameStore.setMode('online')
	render(Page)
	expect(screen.getByLabelText('Display name')).toBeInTheDocument()
	expect(screen.queryByText('New Game')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm vitest run src/lib/components/SettingsModal.test.ts src/routes/page.test.ts
```

Expected: FAIL because online options/rendering do not exist.

- [ ] **Step 3: Update settings**

Use:

```svelte
<option value="single">Single Player</option>
<option value="multi">Local Multiplayer</option>
<option value="online">Online Multiplayer</option>
```

Render player count when:

```svelte
{#if mode === 'multi' || mode === 'online'}
```

Do not start a local game when selecting online mode; reset local state and let the online component restore/create a room.

- [ ] **Step 4: Update page composition**

Import:

```ts
import OnlineMultiplayerGame from '$lib/components/OnlineMultiplayerGame.svelte'
```

Render:

```svelte
{#if $gameStore.mode === 'single'}
	<SinglePlayerGame />
{:else if $gameStore.mode === 'multi'}
	<MultiPlayerGame />
{:else}
	<OnlineMultiplayerGame />
{/if}
```

Render the global New Game button only for single/local modes:

```svelte
{#if $gameStore.mode !== 'online'}
	<div class="text-center my-5">
		<button onclick={startNewGame}>New Game</button>
	</div>
{/if}
```

Preserve its existing classes and accessible label.

- [ ] **Step 5: Run affected and full component tests**

Run:

```bash
pnpm vitest run src/lib/components/SettingsModal.test.ts src/routes/page.test.ts
pnpm test:run
pnpm check
```

Expected: all unit/component tests PASS and checks exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/SettingsModal.svelte src/lib/components/SettingsModal.test.ts src/routes/+page.svelte src/routes/page.test.ts
git commit -m "feat: expose online multiplayer mode"
```

---

### Task 13: Add multi-browser emulator end-to-end coverage

**Files:**
- Modify: `README.md`
- Modify: `playwright.config.ts`
- Create: `e2e/online-multiplayer.spec.ts`

- [ ] **Step 1: Document and configure emulator-backed browser tests**

Before adding the spec, extend the README Testing table and requirements:

```md
| Firebase integration | `functions/src/*.test.ts`, `src/lib/firebase/firestore.rules.test.ts` | Emulator-only transactions, cleanup, and security rules |
| Online end-to-end | `e2e/online-multiplayer.spec.ts` | Separate browser contexts for create/join, turns, reconnect, and errors |
```

State that Firebase tests must use project `demo-number-guessing`, never
production services, and that every online player uses a separate Playwright
browser context.

Add this top-level option so the normal E2E suite keeps running without
Firebase, while `firebase emulators:exec` enables the online spec:

```ts
testIgnore: process.env.FIRESTORE_EMULATOR_HOST
	? undefined
	: '**/online-multiplayer.spec.ts',
```

Change:

```ts
webServer: {
	command: 'pnpm dev --mode test',
	url: 'http://localhost:5173',
	reuseExistingServer: !process.env.CI,
	timeout: 120000,
},
```

- [ ] **Step 2: Write the failing two-player flow**

Create `e2e/online-multiplayer.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

async function selectOnlineMode(page: Page, playerCount = '2') {
	await page.getByLabel('Open Settings').click()
	await page.getByLabel('Game Mode:').selectOption('online')
	await page.getByLabel('Number of Players:').selectOption(playerCount)
	await page.getByText('Close', { exact: true }).click()
}

async function readRoomId(page: Page): Promise<string> {
	const roomId = (await page.getByTestId('room-id').textContent())?.trim() ?? ''
	expect(roomId).toMatch(/^[A-Z2-9]{6}$/)
	return roomId
}

test('two remote players create, join, play, and finish a room', async ({
	browser,
}) => {
	const hostContext = await browser.newContext()
	const guestContext = await browser.newContext()
	const host = await hostContext.newPage()
	const guest = await guestContext.newPage()

	await host.goto('/')
	await guest.goto('/')
	await selectOnlineMode(host)
	await selectOnlineMode(guest)

	await host.getByLabel('Display name').fill('Ada')
	await host.getByRole('button', { name: 'Create Room' }).click()
	const roomId = await readRoomId(host)

	await guest.getByLabel('Display name').fill('Lin')
	await guest.getByLabel('Room ID').fill(roomId)
	await guest.getByRole('button', { name: 'Join Room' }).click()

	await expect(host.getByText('Lin')).toBeVisible()
	await host.getByLabel('Secret number').fill('123')
	await host.getByRole('button', { name: 'Ready' }).click()
	await guest.getByLabel('Secret number').fill('456')
	await guest.getByRole('button', { name: 'Ready' }).click()
	await host.getByRole('button', { name: 'Start Game' }).click()

	await host.getByLabel('Target player').selectOption({ label: 'Lin' })
	await host.getByLabel('Guess').fill('456')
	await host.getByRole('button', { name: 'Submit Guess' }).click()

	await expect(host.getByText('Ada wins!')).toBeVisible()
	await expect(guest.getByText('Ada wins!')).toBeVisible()

	await hostContext.close()
	await guestContext.close()
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run:

```bash
pnpm test:e2e:online
```

Expected: FAIL until all emulator callables and selectors are wired correctly.

- [ ] **Step 4: Add reconnect and three-player rotation tests**

Append these tests, keeping each player in a separate browser context:

```ts
test('refresh reconnects the same browser to its room', async ({ browser }) => {
	const hostContext = await browser.newContext()
	const host = await hostContext.newPage()

	await host.goto('/')
	await selectOnlineMode(host)
	await host.getByLabel('Display name').fill('Ada')
	await host.getByRole('button', { name: 'Create Room' }).click()
	const roomId = await readRoomId(host)

	await host.reload()

	await expect(host.getByText(`Room ${roomId}`)).toBeVisible()
	await expect(host.getByText('Ada')).toBeVisible()
	await hostContext.close()
})

test('three players rotate turns and the last active player wins', async ({
	browser,
}) => {
	const hostContext = await browser.newContext()
	const secondContext = await browser.newContext()
	const thirdContext = await browser.newContext()
	const host = await hostContext.newPage()
	const second = await secondContext.newPage()
	const third = await thirdContext.newPage()

	await Promise.all([host.goto('/'), second.goto('/'), third.goto('/')])
	await Promise.all([
		selectOnlineMode(host, '3'),
		selectOnlineMode(second, '3'),
		selectOnlineMode(third, '3'),
	])

	await host.getByLabel('Display name').fill('Ada')
	await host.getByRole('button', { name: 'Create Room' }).click()
	const roomId = await readRoomId(host)

	await second.getByLabel('Display name').fill('Lin')
	await second.getByLabel('Room ID').fill(roomId)
	await second.getByRole('button', { name: 'Join Room' }).click()
	await third.getByLabel('Display name').fill('Grace')
	await third.getByLabel('Room ID').fill(roomId)
	await third.getByRole('button', { name: 'Join Room' }).click()

	await host.getByLabel('Secret number').fill('111')
	await host.getByRole('button', { name: 'Ready' }).click()
	await second.getByLabel('Secret number').fill('222')
	await second.getByRole('button', { name: 'Ready' }).click()
	await third.getByLabel('Secret number').fill('333')
	await third.getByRole('button', { name: 'Ready' }).click()
	await host.getByRole('button', { name: 'Start Game' }).click()

	await host.getByLabel('Target player').selectOption({ label: 'Lin' })
	await host.getByLabel('Guess').fill('999')
	await host.getByRole('button', { name: 'Submit Guess' }).click()
	await expect(second.getByText("Lin's turn")).toBeVisible()

	await second.getByLabel('Target player').selectOption({ label: 'Ada' })
	await second.getByLabel('Guess').fill('111')
	await second.getByRole('button', { name: 'Submit Guess' }).click()
	await expect(second.getByText("Lin's turn")).toBeVisible()

	await second.getByLabel('Target player').selectOption({ label: 'Grace' })
	await second.getByLabel('Guess').fill('333')
	await second.getByRole('button', { name: 'Submit Guess' }).click()
	await expect(host.getByText('Lin wins!')).toBeVisible()
	await expect(second.getByText('Lin wins!')).toBeVisible()
	await expect(third.getByText('Lin wins!')).toBeVisible()

	await Promise.all([
		hostContext.close(),
		secondContext.close(),
		thirdContext.close(),
	])
})

test('shows a friendly error for a missing room', async ({ page }) => {
	await page.goto('/')
	await selectOnlineMode(page)
	await page.getByLabel('Display name').fill('Ada')
	await page.getByLabel('Room ID').fill('ZZZZZZ')
	await page.getByRole('button', { name: 'Join Room' }).click()

	await expect(page.getByRole('alert')).toHaveText('Room not found or expired.')
})
```

- [ ] **Step 5: Run online and existing E2E suites**

Run:

```bash
pnpm test:e2e:online
pnpm test:e2e
```

Expected: online emulator flows and existing single/local flows PASS.

- [ ] **Step 6: Commit**

```bash
git add README.md playwright.config.ts e2e/online-multiplayer.spec.ts
git commit -m "test: cover Firebase online multiplayer"
```

---

### Task 14: Update CI and deployment

**Files:**
- Modify: `README.md`
- Modify: `.github/workflows/deploy.yml:37-63`
- Create: `.github/workflows/deploy-firebase.yml`

- [ ] **Step 1: Document deployment configuration, then inject public variables**

Extend README Deployment before editing workflows:

- GitHub Pages remains the static web host.
- Cloud Functions and Firestore deploy from the backend workflow in
  `us-central1`.
- Repository variables:
  `PUBLIC_FIREBASE_API_KEY`, `PUBLIC_FIREBASE_AUTH_DOMAIN`,
  `PUBLIC_FIREBASE_PROJECT_ID`, `PUBLIC_FIREBASE_STORAGE_BUCKET`,
  `PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, and `PUBLIC_FIREBASE_APP_ID`.
- Repository secret: `FIREBASE_SERVICE_ACCOUNT`.
- Enable Anonymous Auth and create the Firestore database before the first
  backend deploy; never place the service account in a public variable or file.

Change the Build step in `deploy.yml`:

```yaml
      - name: Build
        run: pnpm run build
        env:
          NODE_ENV: production
          PUBLIC_FIREBASE_API_KEY: ${{ vars.PUBLIC_FIREBASE_API_KEY }}
          PUBLIC_FIREBASE_AUTH_DOMAIN: ${{ vars.PUBLIC_FIREBASE_AUTH_DOMAIN }}
          PUBLIC_FIREBASE_PROJECT_ID: ${{ vars.PUBLIC_FIREBASE_PROJECT_ID }}
          PUBLIC_FIREBASE_STORAGE_BUCKET: ${{ vars.PUBLIC_FIREBASE_STORAGE_BUCKET }}
          PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${{ vars.PUBLIC_FIREBASE_MESSAGING_SENDER_ID }}
          PUBLIC_FIREBASE_APP_ID: ${{ vars.PUBLIC_FIREBASE_APP_ID }}
          PUBLIC_FIREBASE_FUNCTIONS_REGION: us-central1
```

- [ ] **Step 2: Add backend deployment workflow**

Create `.github/workflows/deploy-firebase.yml`:

```yaml
name: Deploy Firebase Backend

on:
  push:
    branches:
      - main
    paths:
      - "functions/**"
      - "firestore.rules"
      - "firestore.indexes.json"
      - "firebase.json"
      - "pnpm-lock.yaml"
      - "pnpm-workspace.yaml"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: firebase-backend
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Test Functions
        run: pnpm test:functions

      - name: Test Firebase rules and transactions
        run: pnpm test:firebase

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}

      - name: Deploy Firebase backend
        run: >
          pnpm firebase deploy
          --project "${{ vars.PUBLIC_FIREBASE_PROJECT_ID }}"
          --only functions,firestore:rules,firestore:indexes
          --non-interactive
```

- [ ] **Step 3: Validate workflow syntax and local equivalents**

Run:

```bash
pnpm --dir functions build
pnpm test:functions
pnpm test:firebase
pnpm build
```

Expected: every command exits 0. Inspect both YAML files for valid indentation.

- [ ] **Step 4: Commit**

```bash
git add README.md .github/workflows/deploy.yml .github/workflows/deploy-firebase.yml
git commit -m "ci: deploy Firebase online backend"
```

---

### Task 15: Update README and complete verification

**Files:**
- Modify: `README.md:9-315`

- [ ] **Step 1: Update the single source of truth**

Review the README updates made alongside Tasks 1, 10, 13, and 14, then make
the final compact pass:

- Commands: add `firebase:emulators`, `test:functions`, `test:firebase`, and
  `test:e2e:online`.
- Setup: show local emulator startup and production setup (enable Anonymous
  Auth, create Firestore, use `us-central1`, and configure the six public
  repository variables plus `FIREBASE_SERVICE_ACCOUNT`).
- Architecture/file map: confirm `functions/`, Firebase configuration,
  `OnlineMultiplayerGame.svelte`, `onlineGameService.ts`, and
  `src/lib/online/types.ts` are present.
- Remove the obsolete statement that the project has no server, API, or
  database.
- Keep the README concise and add:
  `2026-07-27 — Added secure Firebase online rooms while retaining local multiplayer.`

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

- Svelte check reports 0 errors and 0 warnings.
- Unit/component, Functions, rules/emulator, online E2E, and existing E2E tests pass.
- Production build exits 0 and writes `build/`.
- `git diff --check` prints nothing.

- [ ] **Step 3: Scan for secrets and forbidden code**

Run:

```bash
rg -n "private_key|client_email|BEGIN PRIVATE KEY|console\\.log|\\bany\\b" . --glob "!node_modules/**" --glob "!pnpm-lock.yaml" --glob "!docs/superpowers/**"
```

Expected: no committed credentials, `console.log`, or new `any`. Review legitimate prose matches manually.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git status --short
git diff --stat
git diff -- README.md package.json firebase.json firestore.rules
```

Expected: only online multiplayer, Firebase configuration, tests, workflows, and README changes.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document Firebase online multiplayer"
```

---

## Execution checkpoints

1. After Task 7, the Firebase backend, transactions, cleanup, and security rules work entirely in emulators.
2. After Task 9, the browser service can authenticate, call commands, and consume public snapshots without UI.
3. After Task 12, the complete feature is usable through component tests.
4. After Task 13, separate browsers prove real-time play and reconnect behavior.
5. After Task 15, CI, deployment documentation, and all verification are complete.
