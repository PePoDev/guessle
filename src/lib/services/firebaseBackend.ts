import { signInAnonymously } from 'firebase/auth'
import { collection, doc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { getFirebaseClient } from '$lib/firebase/client'
import type { OnlineErrorCode, OnlineSnapshot } from '$lib/online/types'
import {
	decodeOnlineSnapshot,
	mapOnlineGameError,
	type RawSnapshot,
} from './onlineGameService'

// With App Check on, the SDKs wait for a reCAPTCHA token before sending, and
// the Functions SDK starts its own 70-second timeout only after that; if
// reCAPTCHA never loads (a blocker, a flaky network), a command would hang
// with every control disabled. This backstop gives up just after the SDK would.
export const COMMAND_TIMEOUT_MS = 80_000

function withTimeout<T>(work: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			reject(Object.assign(new Error('unavailable'), { code: 'functions/unavailable' }))
		}, COMMAND_TIMEOUT_MS)
	})
	return Promise.race([work, timeout]).finally(() => clearTimeout(timer))
}

export async function ensureFirebaseUser(): Promise<string> {
	const { auth } = await getFirebaseClient()
	await auth.authStateReady()
	if (auth.currentUser) {
		return auth.currentUser.uid
	}
	return (await withTimeout(signInAnonymously(auth))).user.uid
}

export async function callFirebase(
	name: string,
	input: Record<string, unknown>,
): Promise<unknown> {
	const { functions } = await getFirebaseClient()
	return (
		await withTimeout(
			httpsCallable<Record<string, unknown>, unknown>(functions, name)(input),
		)
	).data
}

function subscriptionMessage(error: unknown): OnlineErrorCode {
	if (
		error &&
		typeof error === 'object' &&
		'code' in error &&
		error.code === 'permission-denied'
	) {
		return 'ROOM_NOT_FOUND'
	}
	return mapOnlineGameError(error)
}

export function subscribeFirebaseRoom(
	roomId: string,
	onValue: (snapshot: OnlineSnapshot) => void,
	onError: (code: OnlineErrorCode) => void,
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
							onError('ROOM_NOT_FOUND')
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
