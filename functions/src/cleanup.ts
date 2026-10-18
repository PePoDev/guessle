import {
	Timestamp,
	type DocumentReference,
	type Firestore,
	type QueryDocumentSnapshot,
} from 'firebase-admin/firestore'
import { db } from './firestore.js'

async function deleteExpiredRoom(
	firestore: Firestore,
	room: DocumentReference,
	now: Timestamp,
): Promise<boolean> {
	const expired = await firestore.runTransaction(async (transaction) => {
		const expiresAt = (await transaction.get(room)).get('expiresAt')
		return expiresAt instanceof Timestamp && expiresAt.toMillis() <= now.toMillis()
	})
	if (!expired) {
		return false
	}
	// Secrets go first: a run interrupted after this still leaves the expired
	// room for the next run to find, whereas orphaned secrets would never be found.
	await firestore.recursiveDelete(firestore.collection('roomSecrets').doc(room.id))
	await firestore.recursiveDelete(room)
	return true
}

export async function cleanupExpiredRooms(
	firestore: Firestore = db,
	now: Timestamp = Timestamp.now(),
	pageSize = 200,
): Promise<string[]> {
	const deleted: string[] = []
	let cursor: QueryDocumentSnapshot | undefined

	for (;;) {
		let expiredQuery = firestore
			.collection('rooms')
			.where('expiresAt', '<=', now)
			.orderBy('expiresAt')
			.limit(pageSize)
		if (cursor) {
			expiredQuery = expiredQuery.startAfter(cursor)
		}
		const page = await expiredQuery.get()
		const results = await Promise.all(
			page.docs.map((room) => deleteExpiredRoom(firestore, room.ref, now)),
		)
		page.docs.forEach((room, index) => {
			if (results[index]) {
				deleted.push(room.id)
			}
		})
		if (page.size < pageSize) {
			return deleted
		}
		cursor = page.docs[page.docs.length - 1]
	}
}

async function deleteExpiredRateLimit(
	firestore: Firestore,
	limit: DocumentReference,
	now: Timestamp,
): Promise<boolean> {
	// Re-checked in a transaction because createRoom may have refreshed the
	// window since the query, and deleting it then would forget a recent room.
	return firestore.runTransaction(async (transaction) => {
		const expiresAt = (await transaction.get(limit)).get('expiresAt')
		if (!(expiresAt instanceof Timestamp) || expiresAt.toMillis() > now.toMillis()) {
			return false
		}
		transaction.delete(limit)
		return true
	})
}

export async function cleanupExpiredRateLimits(
	firestore: Firestore = db,
	now: Timestamp = Timestamp.now(),
	pageSize = 200,
): Promise<string[]> {
	const deleted: string[] = []
	let cursor: QueryDocumentSnapshot | undefined

	for (;;) {
		let expiredQuery = firestore
			.collection('rateLimits')
			.where('expiresAt', '<=', now)
			.orderBy('expiresAt')
			.limit(pageSize)
		if (cursor) {
			expiredQuery = expiredQuery.startAfter(cursor)
		}
		const page = await expiredQuery.get()
		const results = await Promise.all(
			page.docs.map((limit) => deleteExpiredRateLimit(firestore, limit.ref, now)),
		)
		page.docs.forEach((limit, index) => {
			if (results[index]) {
				deleted.push(limit.id)
			}
		})
		if (page.size < pageSize) {
			return deleted
		}
		cursor = page.docs[page.docs.length - 1]
	}
}
