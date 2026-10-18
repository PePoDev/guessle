import type {
	OnlineErrorCode,
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
	joinRoom(input: {
		name: string
		roomId: string
	}): Promise<{ uid: string; roomId: string }>
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
	removeIdlePlayer(input: { roomId: string; turnNumber: number }): Promise<void>
	savedRoomId(): string
	clearSession(): void
	subscribeToRoom(
		roomId: string,
		onValue: (snapshot: OnlineSnapshot) => void,
		onError: (code: OnlineErrorCode) => void,
	): () => void
}

export interface RawSnapshot {
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
		onError: (code: OnlineErrorCode) => void,
	): () => void
	getStoredRoomId(): string
	setStoredRoomId(roomId: string): void
	clearStoredRoomId(): void
}

const serverReasons: OnlineErrorCode[] = [
	'AUTH_REQUIRED',
	'NAME_INVALID',
	'DIGIT_COUNT_INVALID',
	'PLAYER_COUNT_INVALID',
	'ROOM_ID_INVALID',
	'ROOM_NOT_FOUND',
	'ROOM_FULL',
	'ROOM_ALREADY_STARTED',
	'HOST_REQUIRED',
	'ROOM_NOT_READY',
	'ROOM_NOT_GUESSING',
	'ROOM_NOT_FINISHED',
	'GUESS_INVALID',
	'GUESS_INPUT_INVALID',
	'TURN_STALE',
	'TARGET_INVALID',
	'TARGET_ELIMINATED',
	'ONLINE_GAME_INTERNAL',
	'ROOM_CREATE_LIMIT',
	'TURN_NOT_IDLE',
]

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

// Fields added after rooms first shipped may be missing on older documents.
function optionalNumber(value: unknown, fallback: number): number {
	return value === undefined ? fallback : number(value)
}

function optionalBoolean(value: unknown): boolean {
	return value === undefined ? false : boolean(value)
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
		match: optionalNumber(data.match, 1),
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
		left: optionalBoolean(data.left),
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
		match: optionalNumber(data.match, 1),
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

function browserOffline(): boolean {
	return typeof navigator !== 'undefined' && navigator.onLine === false
}

export function mapOnlineGameError(error: unknown): OnlineErrorCode {
	if (!error || typeof error !== 'object' || Array.isArray(error)) {
		return 'ONLINE_GAME_INTERNAL'
	}
	const data = error as Record<string, unknown>
	const code = typeof data.code === 'string' ? data.code : ''
	if (
		code.endsWith('/unavailable') ||
		code === 'unavailable' ||
		code === 'auth/network-request-failed'
	) {
		return 'CONNECTION_INTERRUPTED'
	}
	if (code.endsWith('/aborted') || code === 'aborted') {
		return 'ROOM_CHANGED'
	}
	const message = typeof data.message === 'string' ? data.message : ''
	// Losing membership ends the saved session the same way a deleted room does.
	if (message.includes('ROOM_MEMBERSHIP_REQUIRED')) {
		return 'ROOM_NOT_FOUND'
	}
	const reason = serverReasons.find((candidate) => message.includes(candidate))
	if (reason) {
		return reason
	}
	// The server names every failure it sends, so a bare 'internal' means the
	// browser never got an answer: the Functions SDK reports a failed fetch as
	// status 0, and from 0.14 it appends that status as ' [0]'. A function that
	// was never deployed fails that way too, because its 404 carries no CORS
	// headers; only the browser's own state tells the two apart.
	if (code === 'functions/internal' && /^internal(?: \[0\])?$/.test(message)) {
		return browserOffline() ? 'CONNECTION_INTERRUPTED' : 'ONLINE_UNAVAILABLE'
	}
	// A missing callable, missing web config, or disabled anonymous sign-in all
	// mean the backend is not set up, which retrying cannot fix.
	if (
		message.includes('FIREBASE_CONFIG_MISSING') ||
		code.endsWith('/not-found') ||
		code.endsWith('/unimplemented') ||
		code === 'auth/operation-not-allowed' ||
		code === 'auth/admin-restricted-operation'
	) {
		return 'ONLINE_UNAVAILABLE'
	}
	return 'ONLINE_GAME_INTERNAL'
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
			const normalized = {
				...input,
				roomId: input.roomId.trim().toUpperCase(),
			}
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
		async removeIdlePlayer(input) {
			await run('removeIdlePlayer', input)
		},
		savedRoomId() {
			return dependencies.getStoredRoomId()
		},
		clearSession() {
			dependencies.clearStoredRoomId()
		},
		subscribeToRoom(roomId, onValue, onError) {
			return dependencies.subscribeRoom(roomId, onValue, onError)
		},
	}
}

// The Firebase SDK is most of the app's JavaScript, so it loads only once a
// player actually goes online.
function loadFirebaseBackend() {
	return import('./firebaseBackend')
}

export function preloadOnlineBackend(): void {
	void loadFirebaseBackend().catch(() => undefined)
}

const firebaseDependencies: OnlineGameDependencies = {
	ensureUser: async () => (await loadFirebaseBackend()).ensureFirebaseUser(),
	call: async (name, input) =>
		(await loadFirebaseBackend()).callFirebase(name, input),
	subscribeRoom: (roomId, onValue, onError) => {
		let cancelled = false
		let unsubscribe: (() => void) | undefined
		void loadFirebaseBackend()
			.then((backend) => {
				if (!cancelled) {
					unsubscribe = backend.subscribeFirebaseRoom(roomId, onValue, onError)
				}
			})
			.catch((error: unknown) => {
				if (!cancelled) {
					onError(mapOnlineGameError(error))
				}
			})
		return () => {
			cancelled = true
			unsubscribe?.()
		}
	},
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
