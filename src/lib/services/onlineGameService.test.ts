import { afterEach, describe, expect, it, vi } from 'vitest'
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

describe('online game service', () => {
	it('maps stable callable reasons to error codes', () => {
		expect(
			mapOnlineGameError({
				code: 'functions/not-found',
				message: 'ROOM_NOT_FOUND',
			}),
		).toBe('ROOM_NOT_FOUND')
		expect(
			mapOnlineGameError({
				code: 'functions/resource-exhausted',
				message: 'ROOM_FULL',
			}),
		).toBe('ROOM_FULL')
	})

	it('maps transport failures and unknown reasons to client codes', () => {
		expect(mapOnlineGameError({ code: 'functions/unavailable' })).toBe(
			'CONNECTION_INTERRUPTED',
		)
		expect(mapOnlineGameError({ code: 'aborted' })).toBe('ROOM_CHANGED')
		expect(
			mapOnlineGameError({
				code: 'functions/permission-denied',
				message: 'ROOM_MEMBERSHIP_REQUIRED',
			}),
		).toBe('ROOM_NOT_FOUND')
		expect(mapOnlineGameError({ message: 'SOMETHING_NEW' })).toBe(
			'ONLINE_GAME_INTERNAL',
		)
		expect(
			mapOnlineGameError({ code: 'functions/internal', message: 'INTERNAL' }),
		).toBe('ONLINE_GAME_INTERNAL')
	})

	it('reports a missing backend as unavailable rather than retryable', () => {
		expect(
			mapOnlineGameError({ code: 'functions/not-found', message: 'NOT_FOUND' }),
		).toBe('ONLINE_UNAVAILABLE')
		expect(mapOnlineGameError(new Error('FIREBASE_CONFIG_MISSING'))).toBe(
			'ONLINE_UNAVAILABLE',
		)
		expect(
			mapOnlineGameError({ code: 'auth/operation-not-allowed', message: '' }),
		).toBe('ONLINE_UNAVAILABLE')
		expect(
			mapOnlineGameError({
				code: 'functions/not-found',
				message: 'ROOM_NOT_FOUND',
			}),
		).toBe('ROOM_NOT_FOUND')
		expect(mapOnlineGameError('offline')).toBe('ONLINE_GAME_INTERNAL')
	})

	// What @firebase/functions throws when the browser's fetch rejects, as it
	// does for an undeployed function whose 404 has no CORS headers: SDK 0.13
	// says 'internal', and 0.14 appends the HTTP status.
	describe.each(['internal', 'internal [0]'])('when the callable cannot be reached (%s)', (message) => {
		const unreachable = { code: 'functions/internal', message }

		afterEach(() => {
			vi.restoreAllMocks()
		})

		it('reports a missing backend as unavailable while the browser is online', () => {
			vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)

			expect(mapOnlineGameError(unreachable)).toBe('ONLINE_UNAVAILABLE')
		})

		it('reports a lost connection while the browser is offline', () => {
			vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

			expect(mapOnlineGameError(unreachable)).toBe('CONNECTION_INTERRUPTED')
			expect(
				mapOnlineGameError({
					code: 'auth/network-request-failed',
					message: 'Firebase: Error (auth/network-request-failed).',
				}),
			).toBe('CONNECTION_INTERRUPTED')
		})

		it('keeps failures the server reports as retryable', () => {
			vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)

			expect(
				mapOnlineGameError({
					code: 'functions/internal',
					message: 'ONLINE_GAME_INTERNAL',
				}),
			).toBe('ONLINE_GAME_INTERNAL')
			expect(
				mapOnlineGameError({ code: 'functions/internal', message: 'INTERNAL' }),
			).toBe('ONLINE_GAME_INTERNAL')
			// A backend that answered, even with an unhandled 500, is not missing.
			expect(
				mapOnlineGameError({ code: 'functions/internal', message: 'internal [500]' }),
			).toBe('ONLINE_GAME_INTERNAL')
		})
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
})
