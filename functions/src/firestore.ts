import { getApps, initializeApp } from 'firebase-admin/app'
import {
	Timestamp,
	getFirestore,
	type DocumentSnapshot,
	type Firestore,
} from 'firebase-admin/firestore'
import { CommandError } from './errors.js'

if (getApps().length === 0) {
	initializeApp()
}

export const db = getFirestore()
export { Timestamp }

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
	turnStartedAt: Timestamp | null
	match: number
	createdAt: Timestamp
	updatedAt: Timestamp
	expiresAt: Timestamp
}

export interface PlayerDocument {
	name: string
	seat: number
	ready: boolean
	eliminated: boolean
	left: boolean
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
	match: number
	createdAt: Timestamp
}

export interface SecretDocument {
	number: string
	updatedAt: Timestamp
}

export interface RateLimitDocument {
	roomCreatedAt: Timestamp[]
	expiresAt: Timestamp
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

export function rateLimitRef(firestore: Firestore, uid: string) {
	return firestore.collection('rateLimits').doc(uid)
}

export function liveRoom(snapshot: DocumentSnapshot, now: Timestamp): RoomDocument {
	const room = snapshot.data() as RoomDocument | undefined
	if (!room || room.expiresAt.toMillis() <= now.toMillis()) {
		throw new CommandError('not-found', 'ROOM_NOT_FOUND')
	}
	return room
}
