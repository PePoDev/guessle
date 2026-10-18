import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions/logger'
import { DomainError } from './domain.js'

export class CommandError extends Error {
	constructor(
		public readonly code: FunctionsErrorCode,
		public readonly reason: string,
	) {
		super(reason)
	}
}

const abortedStatus = 10

function errorCode(error: unknown): string | number | undefined {
	if (error && typeof error === 'object' && 'code' in error) {
		const { code } = error
		if (typeof code === 'string' || typeof code === 'number') {
			return code
		}
	}
	return undefined
}

export function toHttpsError(error: unknown): HttpsError {
	if (error instanceof CommandError) {
		return new HttpsError(error.code, error.reason)
	}
	if (error instanceof DomainError) {
		return new HttpsError('invalid-argument', error.code)
	}
	const code = errorCode(error)
	if (code === abortedStatus || code === 'aborted' || code === 'ABORTED') {
		return new HttpsError('aborted', 'ROOM_CHANGED')
	}
	// Messages can carry document paths or request values, so only the
	// error's identity is logged.
	logger.error('Unexpected online command error', {
		name: error instanceof Error ? error.name : typeof error,
		code: code ?? null,
	})
	return new HttpsError('internal', 'ONLINE_GAME_INTERNAL')
}

// The SDK leaves request.app unset when the App Check token is missing or
// fails verification. The rejection reuses AUTH_REQUIRED because the client
// already shows it as a sign-in failure the player can retry.
export function requireAppCheck(app: object | undefined, enforced: boolean): void {
	if (enforced && !app) {
		throw new CommandError('unauthenticated', 'AUTH_REQUIRED')
	}
}

export function requireUid(auth: { uid: string } | undefined): string {
	if (!auth?.uid) {
		throw new CommandError('unauthenticated', 'AUTH_REQUIRED')
	}
	return auth.uid
}
