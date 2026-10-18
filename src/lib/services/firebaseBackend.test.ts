import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { httpsCallable } from 'firebase/functions'
import { signInAnonymously } from 'firebase/auth'
import { COMMAND_TIMEOUT_MS, callFirebase, ensureFirebaseUser } from './firebaseBackend'
import { mapOnlineGameError } from './onlineGameService'

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }))
vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }))
vi.mock('firebase/firestore', () => ({}))
vi.mock('$lib/firebase/client', () => ({
	getFirebaseClient: vi.fn(async () => ({
		auth: { authStateReady: async () => undefined, currentUser: null },
		functions: {},
	})),
}))

const never = () => new Promise<never>(() => {})

async function settle<T>(work: Promise<T>) {
	const outcome = work.then(
		(value) => ({ value }),
		(error: unknown) => ({ error }),
	)
	await vi.advanceTimersByTimeAsync(COMMAND_TIMEOUT_MS)
	return outcome
}

describe('commands that never get an answer', () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
		vi.clearAllMocks()
	})

	it('gives up on a callable stuck waiting for App Check and reports a lost connection', async () => {
		vi.mocked(httpsCallable).mockReturnValue(Object.assign(never, { stream: vi.fn() }))

		const outcome = await settle(callFirebase('createRoom', {}))

		expect(outcome).toHaveProperty('error')
		expect(mapOnlineGameError((outcome as { error: unknown }).error)).toBe('CONNECTION_INTERRUPTED')
	})

	it('gives up on a stuck anonymous sign-in the same way', async () => {
		vi.mocked(signInAnonymously).mockReturnValue(never())

		const outcome = await settle(ensureFirebaseUser())

		expect(mapOnlineGameError((outcome as { error: unknown }).error)).toBe('CONNECTION_INTERRUPTED')
	})

	it('returns the answer when the callable responds in time', async () => {
		vi.mocked(httpsCallable).mockReturnValue(
			Object.assign(async () => ({ data: { roomId: 'AB2C3D' } }), { stream: vi.fn() }),
		)

		await expect(callFirebase('createRoom', {})).resolves.toEqual({ roomId: 'AB2C3D' })
	})
})
