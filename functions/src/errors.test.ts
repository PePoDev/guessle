import { logger } from 'firebase-functions/logger'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DomainError } from './domain.js'
import { CommandError, requireAppCheck, requireUid, toHttpsError } from './errors.js'

afterEach(() => {
	vi.restoreAllMocks()
})

describe('callable errors', () => {
	it('lets calls without App Check through while enforcement is off', () => {
		expect(() => requireAppCheck(undefined, false)).not.toThrow()
		expect(() => requireAppCheck({ appId: 'web' }, false)).not.toThrow()
	})

	it('rejects calls without a verified App Check token when enforced', () => {
		expect(() => requireAppCheck({ appId: 'web' }, true)).not.toThrow()
		expect(() => requireAppCheck(undefined, true)).toThrow(
			expect.objectContaining({
				code: 'unauthenticated',
				reason: 'AUTH_REQUIRED',
			}),
		)
	})

	it('requires an authenticated uid', () => {
		expect(requireUid({ uid: 'player' })).toBe('player')
		expect(() => requireUid(undefined)).toThrow(
			expect.objectContaining({
				code: 'unauthenticated',
				reason: 'AUTH_REQUIRED',
			}),
		)
	})

	it('maps command and domain errors to stable HTTPS errors', () => {
		expect(toHttpsError(new CommandError('not-found', 'ROOM_NOT_FOUND'))).toMatchObject({
			code: 'not-found',
			message: 'ROOM_NOT_FOUND',
		})
		expect(toHttpsError(new DomainError('NAME_INVALID'))).toMatchObject({
			code: 'invalid-argument',
			message: 'NAME_INVALID',
		})
	})

	it('hides unexpected server errors and logs only their name and code', () => {
		const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
		const failure = Object.assign(new TypeError('private detail 4821'), {
			code: 'boom',
		})

		expect(toHttpsError(failure)).toMatchObject({
			code: 'internal',
			message: 'ONLINE_GAME_INTERNAL',
		})
		expect(logError).toHaveBeenCalledTimes(1)
		expect(logError).toHaveBeenCalledWith('Unexpected online command error', {
			name: 'TypeError',
			code: 'boom',
		})
		expect(JSON.stringify(logError.mock.calls)).not.toContain('4821')
	})

	it('maps Firestore contention to a retryable room change without logging', () => {
		const logError = vi.spyOn(logger, 'error').mockImplementation(() => undefined)
		const contention = Object.assign(
			new Error('10 ABORTED: Too much contention on these documents.'),
			{ code: 10 },
		)

		expect(toHttpsError(contention)).toMatchObject({
			code: 'aborted',
			message: 'ROOM_CHANGED',
		})
		expect(toHttpsError({ code: 'aborted' })).toMatchObject({
			code: 'aborted',
			message: 'ROOM_CHANGED',
		})
		expect(logError).not.toHaveBeenCalled()
	})
})
