import { deleteApp, initializeApp } from 'firebase-admin/app'
import { Timestamp, getFirestore } from 'firebase-admin/firestore'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { IDLE_TURN_SECONDS } from './domain.js'
import {
	createRoom,
	joinRoom,
	leaveRoom,
	removeIdlePlayer,
	restartRoom,
	setSecret,
	startRoom,
} from './roomCommands.js'

const projectId = 'demo-number-guessing'
const app = initializeApp({ projectId }, 'room-command-tests')
const firestore = getFirestore(app)
const base = Timestamp.fromDate(new Date('2026-07-27T00:00:00Z'))
const dayMillis = 86_400_000

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

function time(seconds = 0): Timestamp {
	return Timestamp.fromMillis(base.toMillis() + seconds * 1000)
}

function at(seconds = 0) {
	return { firestore, now: () => time(seconds) }
}

function roomDoc(roomId = 'AB2C3D') {
	return firestore.collection('rooms').doc(roomId)
}

function secretDoc(uid: string, roomId = 'AB2C3D') {
	return firestore.collection('roomSecrets').doc(roomId).collection('players').doc(uid)
}

async function roomData(roomId = 'AB2C3D') {
	return (await roomDoc(roomId).get()).data()
}

async function playerData(uid: string, roomId = 'AB2C3D') {
	return (await roomDoc(roomId).collection('players').doc(uid).get()).data()
}

async function secretExists(uid: string, roomId = 'AB2C3D'): Promise<boolean> {
	return (await secretDoc(uid, roomId).get()).exists
}

interface SeedPlayer {
	uid: string
	ready?: boolean
	eliminated?: boolean
	left?: boolean
	secret?: string
}

async function seedRoom(
	room: Record<string, unknown>,
	players: SeedPlayer[],
	guesses: Record<string, unknown>[] = [],
): Promise<void> {
	const batch = firestore.batch()
	batch.set(roomDoc(), {
		hostUid: players[0].uid,
		phase: 'lobby',
		digitCount: 3,
		maxPlayers: 4,
		playerOrder: players.map((player) => player.uid),
		currentGuesserUid: null,
		winnerUid: null,
		turnNumber: 0,
		turnStartedAt: null,
		match: 1,
		createdAt: base,
		updatedAt: base,
		expiresAt: Timestamp.fromMillis(base.toMillis() + dayMillis),
		...room,
	})
	players.forEach((player, seat) => {
		batch.set(roomDoc().collection('players').doc(player.uid), {
			name: player.uid,
			seat,
			ready: player.ready ?? false,
			eliminated: player.eliminated ?? false,
			left: player.left ?? false,
			joinedAt: base,
		})
		if (player.secret) {
			batch.set(secretDoc(player.uid), { number: player.secret, updatedAt: base })
		}
	})
	guesses.forEach((guess, index) => {
		batch.set(roomDoc().collection('guesses').doc(`guess-${index}`), {
			turnNumber: index + 1,
			guesserUid: players[0].uid,
			targetUid: players[1].uid,
			guess: '456',
			correct: false,
			correctDigits: 0,
			correctPositions: 0,
			match: 1,
			createdAt: base,
			...guess,
		})
	})
	await batch.commit()
}

async function seedFinishedRoom(): Promise<void> {
	await seedRoom(
		{
			phase: 'finished',
			maxPlayers: 2,
			winnerUid: 'host',
			turnNumber: 1,
			turnStartedAt: base,
		},
		[
			{ uid: 'host', ready: true, secret: '123' },
			{ uid: 'p2', ready: true, eliminated: true, secret: '456' },
		],
		[{ correct: true, correctDigits: 3, correctPositions: 3 }],
	)
}

async function startedRoom(uids: string[]): Promise<void> {
	await createRoom(
		uids[0],
		{ name: 'Ada', digitCount: 3, maxPlayers: 4 },
		{ ...at(), roomIdFactory: () => 'AB2C3D' },
	)
	for (const uid of uids.slice(1)) {
		await joinRoom(uid, { roomId: 'AB2C3D', name: uid }, at())
	}
	for (const [index, uid] of uids.entries()) {
		await setSecret(uid, { roomId: 'AB2C3D', number: `${index + 1}`.repeat(3) }, at())
	}
	await startRoom(uids[0], { roomId: 'AB2C3D' }, at())
}

async function seedExpiredRoom(phase: string): Promise<void> {
	await seedRoom(
		{
			phase,
			currentGuesserUid: phase === 'guessing' ? 'host' : null,
			turnStartedAt: phase === 'guessing' ? base : null,
			expiresAt: base,
		},
		[
			{ uid: 'host', ready: true, secret: '123' },
			{ uid: 'p2', ready: true, secret: '456' },
			{ uid: 'p3', ready: true, secret: '789' },
		],
	)
}

beforeEach(clearFirestore)
afterAll(() => deleteApp(app))

describe('createRoom', () => {
	it('creates a six-character room with the host as seat zero', async () => {
		const result = await createRoom(
			'host',
			{ name: 'Ada', digitCount: 3, maxPlayers: 3 },
			{ ...at(), roomIdFactory: () => 'AB2C3D' },
		)

		expect(result).toEqual({ roomId: 'AB2C3D' })
		expect(await roomData()).toMatchObject({
			hostUid: 'host',
			phase: 'lobby',
			digitCount: 3,
			maxPlayers: 3,
			playerOrder: ['host'],
			turnStartedAt: null,
			match: 1,
		})
		expect(await playerData('host')).toMatchObject({
			seat: 0,
			ready: false,
			eliminated: false,
			left: false,
		})
	})

	it('retries a colliding room id', async () => {
		await createRoom(
			'other',
			{ name: 'Lin', digitCount: 3, maxPlayers: 2 },
			{ ...at(), roomIdFactory: () => 'TAKEN2' },
		)
		const ids = ['TAKEN2', 'TAKEN2', 'TAKEN2', 'TAKEN2', 'FREE22']

		const result = await createRoom(
			'host',
			{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
			{ ...at(), roomIdFactory: () => ids.shift() ?? 'UNUSED' },
		)

		expect(result).toEqual({ roomId: 'FREE22' })
		expect(ids).toEqual([])
	})

	it('gives up after five colliding room ids', async () => {
		await createRoom(
			'other',
			{ name: 'Lin', digitCount: 3, maxPlayers: 2 },
			{ ...at(), roomIdFactory: () => 'TAKEN2' },
		)
		let attempts = 0

		await expect(
			createRoom(
				'host',
				{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
				{
					...at(),
					roomIdFactory: () => {
						attempts += 1
						return 'TAKEN2'
					},
				},
			),
		).rejects.toMatchObject({ code: 'aborted', reason: 'ROOM_ID_COLLISION' })
		expect(attempts).toBe(5)
	})

	it('limits each uid to ten rooms per rolling hour', async () => {
		let next = 0
		const roomIdFactory = () => `ROOM${'ABCDEFGHJKLMN'[next++]}2`
		for (let minute = 0; minute < 10; minute += 1) {
			await createRoom(
				'host',
				{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
				{ ...at(minute * 60), roomIdFactory },
			)
		}

		await expect(
			createRoom(
				'host',
				{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
				{ ...at(3599), roomIdFactory },
			),
		).rejects.toMatchObject({
			code: 'resource-exhausted',
			reason: 'ROOM_CREATE_LIMIT',
		})
		await expect(
			createRoom(
				'other',
				{ name: 'Lin', digitCount: 3, maxPlayers: 2 },
				{ ...at(3599), roomIdFactory },
			),
		).resolves.toMatchObject({ roomId: expect.any(String) })
		await expect(
			createRoom(
				'host',
				{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
				{ ...at(3600), roomIdFactory },
			),
		).resolves.toMatchObject({ roomId: expect.any(String) })
		const limit = await firestore.collection('rateLimits').doc('host').get()
		expect(limit.data()?.roomCreatedAt).toHaveLength(10)
		expect(limit.data()?.expiresAt).toEqual(time(7200))
	})
})

describe('joinRoom', () => {
	it('joins an existing lobby and is idempotent for the same uid', async () => {
		await createRoom(
			'host',
			{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
			{ ...at(), roomIdFactory: () => 'AB2C3D' },
		)
		await joinRoom('p2', { roomId: 'ab2c3d', name: 'Lin' }, at())
		await joinRoom('p2', { roomId: 'AB2C3D', name: 'Lin' }, at())

		expect((await roomData())?.playerOrder).toEqual(['host', 'p2'])
		expect(await playerData('p2')).toMatchObject({ seat: 1, left: false })
	})

	it('rejects joining a full room', async () => {
		await createRoom(
			'host',
			{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
			{ ...at(), roomIdFactory: () => 'AB2C3D' },
		)
		await joinRoom('p2', { roomId: 'AB2C3D', name: 'Lin' }, at())

		await expect(
			joinRoom('p3', { roomId: 'AB2C3D', name: 'Sam' }, at()),
		).rejects.toMatchObject({ code: 'resource-exhausted', reason: 'ROOM_FULL' })
	})

	it(
		'admits only one player when the final seat is contested',
		async () => {
			await createRoom(
				'host',
				{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
				{ ...at(), roomIdFactory: () => 'AB2C3D' },
			)

			const results = await Promise.allSettled([
				joinRoom('p2', { roomId: 'AB2C3D', name: 'Lin' }, at()),
				joinRoom('p3', { roomId: 'AB2C3D', name: 'Grace' }, at()),
			])

			expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
			expect((await roomData())?.playerOrder).toHaveLength(2)
		},
		15_000,
	)

	it('treats an expired room as missing', async () => {
		await createRoom(
			'host',
			{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
			{ ...at(), roomIdFactory: () => 'AB2C3D' },
		)

		await expect(
			joinRoom('p2', { roomId: 'AB2C3D', name: 'Lin' }, at(86_400)),
		).rejects.toMatchObject({ code: 'not-found', reason: 'ROOM_NOT_FOUND' })
	})

	it('rejects joining a started game', async () => {
		await startedRoom(['host', 'p2'])

		await expect(
			joinRoom('p3', { roomId: 'AB2C3D', name: 'Sam' }, at()),
		).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'ROOM_ALREADY_STARTED',
		})
	})
})

describe('setSecret', () => {
	it('rejects a secret outside the lobby', async () => {
		await startedRoom(['host', 'p2'])

		await expect(
			setSecret('p2', { roomId: 'AB2C3D', number: '999' }, at()),
		).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'ROOM_ALREADY_STARTED',
		})
		expect((await secretDoc('p2').get()).data()?.number).toBe('222')
	})

	it('treats an expired room as missing', async () => {
		await seedExpiredRoom('lobby')

		await expect(
			setSecret('p2', { roomId: 'AB2C3D', number: '999' }, at()),
		).rejects.toMatchObject({ code: 'not-found', reason: 'ROOM_NOT_FOUND' })
	})
})

describe('startRoom', () => {
	it('starts once two players are ready without filling the room', async () => {
		await createRoom(
			'host',
			{ name: 'Ada', digitCount: 3, maxPlayers: 4 },
			{ ...at(), roomIdFactory: () => 'AB2C3D' },
		)
		await joinRoom('p2', { roomId: 'AB2C3D', name: 'Lin' }, at())
		await setSecret('host', { roomId: 'AB2C3D', number: '123' }, at())
		await expect(startRoom('host', { roomId: 'AB2C3D' }, at())).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'ROOM_NOT_READY',
		})
		await setSecret('p2', { roomId: 'AB2C3D', number: '456' }, at())
		await startRoom('host', { roomId: 'AB2C3D' }, at(30))

		expect(await roomData()).toMatchObject({
			phase: 'guessing',
			playerOrder: ['host', 'p2'],
			currentGuesserUid: 'host',
			turnNumber: 0,
			turnStartedAt: time(30),
		})
		expect(await playerData('host')).not.toHaveProperty('number')
	})

	it('removes players who are not ready or have no secret', async () => {
		await seedRoom({}, [
			{ uid: 'host', ready: true, secret: '123' },
			{ uid: 'p2', ready: false, secret: '222' },
			{ uid: 'p3', ready: true },
			{ uid: 'p4', ready: true, secret: '444' },
		])

		await startRoom('host', { roomId: 'AB2C3D' }, at())

		expect(await roomData()).toMatchObject({
			phase: 'guessing',
			playerOrder: ['host', 'p4'],
			currentGuesserUid: 'host',
		})
		expect(await playerData('p2')).toBeUndefined()
		expect(await playerData('p3')).toBeUndefined()
		expect(await secretExists('p2')).toBe(false)
		expect(await playerData('p4')).toMatchObject({ seat: 1 })
	})

	it('does not count a ready player whose secret is missing', async () => {
		await seedRoom({}, [
			{ uid: 'host', ready: true, secret: '123' },
			{ uid: 'p2', ready: true },
		])

		await expect(startRoom('host', { roomId: 'AB2C3D' }, at())).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'ROOM_NOT_READY',
		})
		expect(await roomData()).toMatchObject({ phase: 'lobby' })
		expect(await playerData('p2')).toBeDefined()
	})

	it('requires the host to be ready', async () => {
		await seedRoom({}, [
			{ uid: 'host' },
			{ uid: 'p2', ready: true, secret: '222' },
			{ uid: 'p3', ready: true, secret: '333' },
		])

		await expect(startRoom('host', { roomId: 'AB2C3D' }, at())).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'ROOM_NOT_READY',
		})
	})

	it('rejects a start by a player who is not the host', async () => {
		await seedRoom({}, [
			{ uid: 'host', ready: true, secret: '123' },
			{ uid: 'p2', ready: true, secret: '222' },
		])

		await expect(startRoom('p2', { roomId: 'AB2C3D' }, at())).rejects.toMatchObject({
			code: 'permission-denied',
			reason: 'HOST_REQUIRED',
		})
	})

	it('treats an expired room as missing', async () => {
		await seedExpiredRoom('lobby')

		await expect(startRoom('host', { roomId: 'AB2C3D' }, at())).rejects.toMatchObject({
			code: 'not-found',
			reason: 'ROOM_NOT_FOUND',
		})
	})
})

describe('leaveRoom', () => {
	it('transfers host ownership when the host leaves the lobby', async () => {
		await createRoom(
			'host',
			{ name: 'Ada', digitCount: 3, maxPlayers: 2 },
			{ ...at(), roomIdFactory: () => 'AB2C3D' },
		)
		await joinRoom('p2', { roomId: 'AB2C3D', name: 'Lin' }, at())
		await leaveRoom('host', { roomId: 'AB2C3D' }, at())

		expect(await roomData()).toMatchObject({
			hostUid: 'p2',
			playerOrder: ['p2'],
		})
		expect(await playerData('host')).toBeUndefined()
		expect(await playerData('p2')).toMatchObject({ seat: 0 })
	})

	it('deletes the room and its secrets when the last player leaves', async () => {
		await seedRoom({}, [{ uid: 'host', ready: true, secret: '123' }])

		await leaveRoom('host', { roomId: 'AB2C3D' }, at())

		expect(await roomData()).toBeUndefined()
		expect((await roomDoc().collection('players').get()).empty).toBe(true)
		expect(await secretExists('host')).toBe(false)
	})

	it('forfeits a player who leaves an active match without passing the turn', async () => {
		await startedRoom(['host', 'p2', 'p3'])

		await expect(leaveRoom('p2', { roomId: 'AB2C3D' }, at(10))).resolves.toEqual({
			left: true,
		})

		expect(await roomData()).toMatchObject({
			phase: 'guessing',
			playerOrder: ['host', 'p2', 'p3'],
			currentGuesserUid: 'host',
			turnNumber: 0,
			turnStartedAt: time(),
		})
		expect(await playerData('p2')).toMatchObject({
			name: 'p2',
			eliminated: true,
			left: true,
		})
		expect(await secretExists('p2')).toBe(false)
	})

	it('passes the turn to the next active player when the current guesser leaves', async () => {
		await seedRoom(
			{
				phase: 'guessing',
				currentGuesserUid: 'p2',
				turnNumber: 5,
				turnStartedAt: base,
			},
			[
				{ uid: 'host', ready: true, secret: '111' },
				{ uid: 'p2', ready: true, secret: '222' },
				{ uid: 'p3', ready: true, eliminated: true, secret: '333' },
				{ uid: 'p4', ready: true, secret: '444' },
			],
		)

		await leaveRoom('p2', { roomId: 'AB2C3D' }, at(30))

		expect(await roomData()).toMatchObject({
			phase: 'guessing',
			currentGuesserUid: 'p4',
			turnNumber: 6,
			turnStartedAt: time(30),
		})
	})

	it('moves the host to the first active player when the host forfeits', async () => {
		await seedRoom(
			{ phase: 'guessing', currentGuesserUid: 'p3', turnStartedAt: base },
			[
				{ uid: 'host', ready: true, secret: '111' },
				{ uid: 'p2', ready: true, eliminated: true, secret: '222' },
				{ uid: 'p3', ready: true, secret: '333' },
				{ uid: 'p4', ready: true, secret: '444' },
			],
		)

		await leaveRoom('host', { roomId: 'AB2C3D' }, at())

		expect(await roomData()).toMatchObject({
			hostUid: 'p3',
			phase: 'guessing',
			currentGuesserUid: 'p3',
			turnNumber: 0,
		})
	})

	it('finishes the match when only one active player remains', async () => {
		await startedRoom(['host', 'p2'])

		await leaveRoom('host', { roomId: 'AB2C3D' }, at(5))

		expect(await roomData()).toMatchObject({
			hostUid: 'p2',
			phase: 'finished',
			winnerUid: 'p2',
			currentGuesserUid: null,
			turnNumber: 1,
			turnStartedAt: time(5),
		})
		expect(await playerData('host')).toMatchObject({ eliminated: true, left: true })
		expect(await secretExists('host')).toBe(false)
	})

	it('keeps a finished-room leaver as a left player and moves the host', async () => {
		await seedFinishedRoom()

		await leaveRoom('host', { roomId: 'AB2C3D' }, at())

		expect(await roomData()).toMatchObject({
			hostUid: 'p2',
			phase: 'finished',
			playerOrder: ['p2'],
		})
		expect(await playerData('host')).toMatchObject({ name: 'host', left: true })
		expect(await secretExists('host')).toBe(false)
	})

	it('deletes a finished room when its last present player leaves', async () => {
		await seedRoom({ phase: 'finished', winnerUid: 'host' }, [
			{ uid: 'host', ready: true, secret: '111' },
			{ uid: 'p2', ready: true, eliminated: true, left: true },
		])

		await leaveRoom('host', { roomId: 'AB2C3D' }, at())

		expect(await roomData()).toBeUndefined()
		expect((await roomDoc().collection('players').get()).empty).toBe(true)
		expect(await secretExists('host')).toBe(false)
	})

	it('treats an expired room as missing', async () => {
		await seedExpiredRoom('guessing')

		await expect(leaveRoom('p2', { roomId: 'AB2C3D' }, at())).rejects.toMatchObject({
			code: 'not-found',
			reason: 'ROOM_NOT_FOUND',
		})
		expect(await playerData('p2')).toMatchObject({ left: false })
	})
})

describe('removeIdlePlayer', () => {
	async function seedIdleRoom(): Promise<void> {
		await seedRoom(
			{
				phase: 'guessing',
				currentGuesserUid: 'host',
				turnNumber: 2,
				turnStartedAt: base,
			},
			[
				{ uid: 'host', ready: true, secret: '111' },
				{ uid: 'p2', ready: true, secret: '222' },
				{ uid: 'p3', ready: true, secret: '333' },
				{ uid: 'p4', ready: true, eliminated: true, secret: '444' },
			],
		)
	}

	it('forfeits an idle current guesser and passes the turn', async () => {
		await seedIdleRoom()

		await expect(
			removeIdlePlayer('p3', { roomId: 'AB2C3D', turnNumber: 2 }, at(IDLE_TURN_SECONDS)),
		).resolves.toEqual({ removed: true })

		expect(await roomData()).toMatchObject({
			hostUid: 'p2',
			phase: 'guessing',
			playerOrder: ['host', 'p2', 'p3', 'p4'],
			currentGuesserUid: 'p2',
			turnNumber: 3,
			turnStartedAt: time(IDLE_TURN_SECONDS),
		})
		expect(await playerData('host')).toMatchObject({ eliminated: true, left: true })
		expect(await secretExists('host')).toBe(false)
	})

	it('rejects a turn that is not idle yet', async () => {
		await seedIdleRoom()

		await expect(
			removeIdlePlayer(
				'p2',
				{ roomId: 'AB2C3D', turnNumber: 2 },
				at(IDLE_TURN_SECONDS - 0.001),
			),
		).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'TURN_NOT_IDLE',
		})
		expect(await playerData('host')).toMatchObject({ eliminated: false })
	})

	it('rejects a stale turn number', async () => {
		await seedIdleRoom()

		await expect(
			removeIdlePlayer('p2', { roomId: 'AB2C3D', turnNumber: 1 }, at(600)),
		).rejects.toMatchObject({ code: 'failed-precondition', reason: 'TURN_STALE' })
	})

	it('rejects the current guesser, eliminated players, and nonmembers', async () => {
		await seedIdleRoom()
		const input = { roomId: 'AB2C3D', turnNumber: 2 }

		await expect(removeIdlePlayer('host', input, at(600))).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'TARGET_INVALID',
		})
		await expect(removeIdlePlayer('p4', input, at(600))).rejects.toMatchObject({
			code: 'permission-denied',
			reason: 'ROOM_MEMBERSHIP_REQUIRED',
		})
		await expect(removeIdlePlayer('stranger', input, at(600))).rejects.toMatchObject({
			code: 'permission-denied',
			reason: 'ROOM_MEMBERSHIP_REQUIRED',
		})
		expect(await playerData('host')).toMatchObject({ eliminated: false })
	})

	it('rejects removal outside a match', async () => {
		await seedRoom({}, [
			{ uid: 'host', ready: true, secret: '111' },
			{ uid: 'p2', ready: true, secret: '222' },
		])

		await expect(
			removeIdlePlayer('p2', { roomId: 'AB2C3D', turnNumber: 0 }, at(600)),
		).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'ROOM_NOT_GUESSING',
		})
	})

	it('finishes the match when the idle player was the last opponent', async () => {
		await startedRoom(['host', 'p2'])

		await removeIdlePlayer('p2', { roomId: 'AB2C3D', turnNumber: 0 }, at(IDLE_TURN_SECONDS))

		expect(await roomData()).toMatchObject({
			hostUid: 'p2',
			phase: 'finished',
			winnerUid: 'p2',
			currentGuesserUid: null,
		})
	})

	it('treats an expired room as missing', async () => {
		await seedExpiredRoom('guessing')

		await expect(
			removeIdlePlayer('p2', { roomId: 'AB2C3D', turnNumber: 0 }, at(600)),
		).rejects.toMatchObject({ code: 'not-found', reason: 'ROOM_NOT_FOUND' })
	})
})

describe('restartRoom', () => {
	it('restarts a finished room without retaining secrets or guesses', async () => {
		await seedFinishedRoom()
		await restartRoom('host', { roomId: 'AB2C3D' }, at())

		expect(await roomData()).toMatchObject({
			phase: 'lobby',
			playerOrder: ['host', 'p2'],
			currentGuesserUid: null,
			winnerUid: null,
			turnNumber: 0,
			turnStartedAt: null,
			match: 2,
		})
		expect((await roomDoc().collection('guesses').get()).empty).toBe(true)
		expect(
			(await firestore.collection('roomSecrets').doc('AB2C3D').collection('players').get())
				.empty,
		).toBe(true)
		const players = await roomDoc().collection('players').get()
		expect(players.docs.every((player) => player.data().ready === false)).toBe(true)
		expect(players.docs.every((player) => player.data().eliminated === false)).toBe(true)
	})

	it('removes players who left during or after the match', async () => {
		await seedRoom(
			{ phase: 'finished', winnerUid: 'p3', playerOrder: ['host', 'p2', 'p3'] },
			[
				{ uid: 'host', ready: true, eliminated: true, secret: '111' },
				{ uid: 'p2', ready: true, eliminated: true, left: true },
				{ uid: 'p3', ready: true, secret: '333' },
				{ uid: 'p4', ready: true, eliminated: true, left: true },
			],
		)

		await restartRoom('host', { roomId: 'AB2C3D' }, at())

		expect(await roomData()).toMatchObject({ phase: 'lobby', playerOrder: ['host', 'p3'] })
		expect(await playerData('p2')).toBeUndefined()
		expect(await playerData('p4')).toBeUndefined()
		expect(await playerData('p3')).toMatchObject({
			seat: 1,
			ready: false,
			eliminated: false,
			left: false,
		})
	})

	it('rejects a restart by a player who is not the host', async () => {
		await seedFinishedRoom()

		await expect(restartRoom('p2', { roomId: 'AB2C3D' }, at())).rejects.toMatchObject({
			code: 'permission-denied',
			reason: 'HOST_REQUIRED',
		})
		expect(await roomData()).toMatchObject({ phase: 'finished', match: 1 })
	})

	it('rejects a restart before the match finishes', async () => {
		await startedRoom(['host', 'p2'])

		await expect(restartRoom('host', { roomId: 'AB2C3D' }, at())).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'ROOM_NOT_FINISHED',
		})
		expect(await secretExists('p2')).toBe(true)
	})

	it(
		'applies only one of two overlapping restarts',
		async () => {
			await seedFinishedRoom()

			const results = await Promise.allSettled([
				restartRoom('host', { roomId: 'AB2C3D' }, at()),
				restartRoom('host', { roomId: 'AB2C3D' }, at()),
			])

			expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
			expect(results.find((result) => result.status === 'rejected')).toMatchObject({
				reason: { code: 'failed-precondition', reason: 'ROOM_NOT_FINISHED' },
			})
			expect(await roomData()).toMatchObject({ phase: 'lobby', match: 2 })
		},
		15_000,
	)

	it('keeps a secret set after an earlier restart when a duplicate restart arrives', async () => {
		await seedFinishedRoom()
		await restartRoom('host', { roomId: 'AB2C3D' }, at())
		await setSecret('p2', { roomId: 'AB2C3D', number: '789' }, at(1))

		await expect(restartRoom('host', { roomId: 'AB2C3D' }, at(2))).rejects.toMatchObject({
			code: 'failed-precondition',
			reason: 'ROOM_NOT_FINISHED',
		})
		expect((await secretDoc('p2').get()).data()?.number).toBe('789')
		expect(await playerData('p2')).toMatchObject({ ready: true })
	})

	it('deletes only guesses from earlier matches', async () => {
		await seedRoom(
			{ phase: 'finished', winnerUid: 'host' },
			[
				{ uid: 'host', ready: true, secret: '111' },
				{ uid: 'p2', ready: true, eliminated: true, secret: '222' },
			],
			[{ match: 1 }, { match: 2 }],
		)

		await restartRoom('host', { roomId: 'AB2C3D' }, at())

		const guesses = await roomDoc().collection('guesses').get()
		expect(guesses.docs.map((guess) => guess.data().match)).toEqual([2])
	})

	it('treats an expired room as missing', async () => {
		await seedExpiredRoom('finished')

		await expect(restartRoom('host', { roomId: 'AB2C3D' }, at())).rejects.toMatchObject({
			code: 'not-found',
			reason: 'ROOM_NOT_FOUND',
		})
		expect(await secretExists('p2')).toBe(true)
	})
})
