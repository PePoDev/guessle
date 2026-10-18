import { randomInt } from 'node:crypto'
import {
	Timestamp,
	type DocumentReference,
	type Firestore,
	type Transaction,
} from 'firebase-admin/firestore'
import {
	isTurnIdle,
	normalizeRoomId,
	resolveForfeit,
	validateDigitCount,
	validateGuess,
	validateMaxPlayers,
	validateName,
} from './domain.js'
import { CommandError } from './errors.js'
import {
	db,
	liveRoom,
	playerRef,
	rateLimitRef,
	roomRef,
	secretRef,
	type GuessDocument,
	type PlayerDocument,
	type RateLimitDocument,
	type RoomDocument,
	type SecretDocument,
} from './firestore.js'

const roomAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const roomIdAttempts = 5
const roomCreateLimit = 10
const roomCreateWindowMillis = 60 * 60 * 1000

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
	const limit = rateLimitRef(firestore, uid)

	for (let attempt = 0; attempt < roomIdAttempts; attempt += 1) {
		const roomId = normalizeRoomId(makeRoomId())
		const room = roomRef(firestore, roomId)
		const player = playerRef(firestore, roomId, uid)
		const created = await firestore.runTransaction(async (transaction) => {
			const [roomSnapshot, limitSnapshot] = await Promise.all([
				transaction.get(room),
				transaction.get(limit),
			])
			const limitData = limitSnapshot.data() as RateLimitDocument | undefined
			const recentCreations = (limitData?.roomCreatedAt ?? []).filter(
				(createdAt) =>
					now.toMillis() - createdAt.toMillis() < roomCreateWindowMillis,
			)
			if (recentCreations.length >= roomCreateLimit) {
				throw new CommandError('resource-exhausted', 'ROOM_CREATE_LIMIT')
			}
			if (roomSnapshot.exists) {
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
				turnStartedAt: null,
				match: 1,
				createdAt: now,
				updatedAt: now,
				expiresAt: expiresAt(now),
			}
			const playerData: PlayerDocument = {
				name,
				seat: 0,
				ready: false,
				eliminated: false,
				left: false,
				joinedAt: now,
			}
			const limitUpdate: RateLimitDocument = {
				roomCreatedAt: [...recentCreations, now],
				// Once the newest creation leaves the window the document limits
				// nothing, so the hourly cleanup can delete it from this field.
				expiresAt: Timestamp.fromMillis(now.toMillis() + roomCreateWindowMillis),
			}
			transaction.create(room, roomData)
			transaction.create(player, playerData)
			transaction.set(limit, limitUpdate)
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
		const roomData = liveRoom(roomSnapshot, now)
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
			left: false,
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
		const roomData = liveRoom(roomSnapshot, now)
		if (!playerSnapshot.exists) {
			throw new CommandError('not-found', 'ROOM_NOT_FOUND')
		}
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
		const roomData = liveRoom(await transaction.get(room), now)
		requireHost(roomData, uid)
		if (roomData.phase !== 'lobby') {
			throw new CommandError('failed-precondition', 'ROOM_NOT_READY')
		}
		const [players, secrets] = await Promise.all([
			Promise.all(
				roomData.playerOrder.map((playerUid) =>
					transaction.get(playerRef(firestore, roomId, playerUid)),
				),
			),
			Promise.all(
				roomData.playerOrder.map((playerUid) =>
					transaction.get(secretRef(firestore, roomId, playerUid)),
				),
			),
		])
		const startingUids = roomData.playerOrder.filter(
			(_, index) =>
				players[index].exists &&
				(players[index].data() as PlayerDocument).ready &&
				secrets[index].exists,
		)
		// Unready players are removed at start, so the host must be among the
		// starters or the room would be left without one.
		if (startingUids.length < 2 || !startingUids.includes(uid)) {
			throw new CommandError('failed-precondition', 'ROOM_NOT_READY')
		}
		roomData.playerOrder.forEach((playerUid, index) => {
			const seat = startingUids.indexOf(playerUid)
			if (seat === -1) {
				transaction.delete(players[index].ref)
				transaction.delete(secrets[index].ref)
			} else {
				transaction.update(players[index].ref, { seat })
			}
		})
		transaction.update(room, {
			phase: 'guessing',
			playerOrder: startingUids,
			currentGuesserUid: startingUids[0],
			turnNumber: 0,
			turnStartedAt: now,
			updatedAt: now,
			expiresAt: expiresAt(now),
		})
	})

	return { phase: 'guessing' }
}

async function forfeit(
	transaction: Transaction,
	firestore: Firestore,
	roomId: string,
	roomData: RoomDocument,
	forfeitUid: string,
	now: Timestamp,
): Promise<void> {
	const players = await Promise.all(
		roomData.playerOrder.map((playerUid) =>
			transaction.get(playerRef(firestore, roomId, playerUid)),
		),
	)
	if (players.some((snapshot) => !snapshot.exists)) {
		throw new CommandError('not-found', 'ROOM_NOT_FOUND')
	}
	const resolution = resolveForfeit({
		playerOrder: roomData.playerOrder,
		eliminatedUids: players
			.filter((snapshot) => (snapshot.data() as PlayerDocument).eliminated)
			.map((snapshot) => snapshot.id),
		currentGuesserUid: roomData.currentGuesserUid,
		hostUid: roomData.hostUid,
		forfeitUid,
	})
	const turnChanged = resolution.currentGuesserUid !== roomData.currentGuesserUid
	transaction.update(playerRef(firestore, roomId, forfeitUid), {
		eliminated: true,
		left: true,
	})
	transaction.delete(secretRef(firestore, roomId, forfeitUid))
	transaction.update(roomRef(firestore, roomId), {
		phase: resolution.currentGuesserUid === null ? 'finished' : 'guessing',
		hostUid: resolution.hostUid,
		currentGuesserUid: resolution.currentGuesserUid,
		winnerUid: resolution.winnerUid,
		...(turnChanged
			? { turnNumber: roomData.turnNumber + 1, turnStartedAt: now }
			: {}),
		updatedAt: now,
		expiresAt: expiresAt(now),
	})
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
		const roomData = liveRoom(await transaction.get(room), now)
		requireMember(roomData, uid)
		if (roomData.phase === 'guessing') {
			await forfeit(transaction, firestore, roomId, roomData, uid, now)
			return false
		}
		const remaining = roomData.playerOrder.filter((playerUid) => playerUid !== uid)
		const [leavingSnapshot, ...remainingPlayers] = await Promise.all(
			[uid, ...remaining].map((playerUid) =>
				transaction.get(playerRef(firestore, roomId, playerUid)),
			),
		)
		const staying = remainingPlayers.filter(
			(snapshot) =>
				snapshot.exists && !(snapshot.data() as PlayerDocument).left,
		)
		transaction.delete(leavingSecret)
		if (staying.length === 0) {
			transaction.delete(leavingPlayer)
			transaction.delete(room)
			return true
		}
		if (roomData.phase === 'finished') {
			// The finished match's history still names this player, so the
			// document stays until restart. Seats are not renumbered here so it
			// never shares a seat with a remaining player.
			if (leavingSnapshot.exists) {
				transaction.update(leavingPlayer, { left: true })
			}
		} else {
			transaction.delete(leavingPlayer)
			remainingPlayers.forEach((snapshot, seat) => {
				if (snapshot.exists) {
					transaction.update(snapshot.ref, { seat })
				}
			})
		}
		transaction.update(room, {
			hostUid: roomData.hostUid === uid ? staying[0].id : roomData.hostUid,
			playerOrder: remaining,
			updatedAt: now,
			expiresAt: expiresAt(now),
		})
		return false
	})

	if (empty) {
		await firestore.recursiveDelete(firestore.collection('roomSecrets').doc(roomId))
		await firestore.recursiveDelete(room)
	}
	return { left: true }
}

export async function removeIdlePlayer(
	uid: string,
	input: { roomId: unknown; turnNumber: unknown },
	options: CommandOptions = {},
): Promise<{ removed: true }> {
	const firestore = options.firestore ?? db
	const now = (options.now ?? Timestamp.now)()
	const roomId = normalizeRoomId(input.roomId)
	const room = roomRef(firestore, roomId)
	const caller = playerRef(firestore, roomId, uid)

	await firestore.runTransaction(async (transaction) => {
		const [roomSnapshot, callerSnapshot] = await Promise.all([
			transaction.get(room),
			transaction.get(caller),
		])
		const roomData = liveRoom(roomSnapshot, now)
		requireMember(roomData, uid)
		const callerData = callerSnapshot.data() as PlayerDocument | undefined
		if (!callerData) {
			throw new CommandError('not-found', 'ROOM_NOT_FOUND')
		}
		if (callerData.eliminated) {
			throw new CommandError('permission-denied', 'ROOM_MEMBERSHIP_REQUIRED')
		}
		if (roomData.phase !== 'guessing' || roomData.currentGuesserUid === null) {
			throw new CommandError('failed-precondition', 'ROOM_NOT_GUESSING')
		}
		if (roomData.currentGuesserUid === uid) {
			throw new CommandError('failed-precondition', 'TARGET_INVALID')
		}
		if (roomData.turnNumber !== input.turnNumber) {
			throw new CommandError('failed-precondition', 'TURN_STALE')
		}
		// Rooms that started before turns were timed fall back to their last update.
		const turnStartedAt = roomData.turnStartedAt ?? roomData.updatedAt
		if (!isTurnIdle(turnStartedAt.toMillis(), now.toMillis())) {
			throw new CommandError('failed-precondition', 'TURN_NOT_IDLE')
		}
		await forfeit(
			transaction,
			firestore,
			roomId,
			roomData,
			roomData.currentGuesserUid,
			now,
		)
	})

	return { removed: true }
}

async function deleteGuessesBefore(
	room: DocumentReference,
	match: number,
): Promise<void> {
	const guesses = await room.collection('guesses').get()
	await Promise.all(
		guesses.docs
			.filter((guess) => ((guess.data() as GuessDocument).match ?? 0) < match)
			.map((guess) => guess.ref.delete()),
	)
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

	const match = await firestore.runTransaction(async (transaction) => {
		const roomData = liveRoom(await transaction.get(room), now)
		requireHost(roomData, uid)
		if (roomData.phase !== 'finished') {
			throw new CommandError('failed-precondition', 'ROOM_NOT_FINISHED')
		}
		const players = await transaction.get(room.collection('players'))
		const staying = new Set(
			players.docs
				.filter((snapshot) => !(snapshot.data() as PlayerDocument).left)
				.map((snapshot) => snapshot.id),
		)
		const stayingUids = roomData.playerOrder.filter((playerUid) =>
			staying.has(playerUid),
		)
		players.docs.forEach((snapshot) => {
			const seat = stayingUids.indexOf(snapshot.id)
			if (seat === -1) {
				transaction.delete(snapshot.ref)
			} else {
				transaction.update(snapshot.ref, {
					seat,
					ready: false,
					eliminated: false,
				})
			}
		})
		new Set([
			...roomData.playerOrder,
			...players.docs.map((snapshot) => snapshot.id),
		]).forEach((playerUid) => {
			transaction.delete(secretRef(firestore, roomId, playerUid))
		})
		// Rooms created before matches were numbered have no match field.
		const nextMatch = (roomData.match ?? 1) + 1
		transaction.update(room, {
			phase: 'lobby',
			playerOrder: stayingUids,
			currentGuesserUid: null,
			winnerUid: null,
			turnNumber: 0,
			turnStartedAt: null,
			match: nextMatch,
			updatedAt: now,
			expiresAt: expiresAt(now),
		})
		return nextMatch
	})

	await deleteGuessesBefore(room, match)
	return { phase: 'lobby' }
}
