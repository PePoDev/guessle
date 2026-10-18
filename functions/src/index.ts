import { setGlobalOptions } from 'firebase-functions/v2'
import { onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { cleanupExpiredRateLimits, cleanupExpiredRooms } from './cleanup.js'
import { requireAppCheck, requireUid, toHttpsError } from './errors.js'
import { submitGuess as submitGuessCommand } from './guessCommand.js'
import {
	createRoom as createRoomCommand,
	joinRoom as joinRoomCommand,
	leaveRoom as leaveRoomCommand,
	removeIdlePlayer as removeIdlePlayerCommand,
	restartRoom as restartRoomCommand,
	setSecret as setSecretCommand,
	startRoom as startRoomCommand,
} from './roomCommands.js'

setGlobalOptions({ region: 'asia-southeast1', maxInstances: 20 })

// A plain environment variable rather than a defineBoolean param: a param
// without a value makes the Functions emulator stop and prompt for one. The
// deploy workflow writes it to the functions' dotenv file, and it is read on
// every call so tests can switch it.
function appCheckEnforced(): boolean {
	return process.env.ENFORCE_APP_CHECK === 'true'
}

function callable<TInput, TOutput>(
	command: (uid: string, input: TInput) => Promise<TOutput>,
) {
	return onCall(async (request) => {
		try {
			requireAppCheck(request.app, appCheckEnforced())
			return await command(requireUid(request.auth), request.data as TInput)
		} catch (error) {
			throw toHttpsError(error)
		}
	})
}

export const createRoom = callable(createRoomCommand)
export const joinRoom = callable(joinRoomCommand)
export const setSecret = callable(setSecretCommand)
export const startRoom = callable(startRoomCommand)
export const submitGuess = callable(submitGuessCommand)
export const leaveRoom = callable(leaveRoomCommand)
export const restartRoom = callable(restartRoomCommand)
export const removeIdlePlayer = callable(removeIdlePlayerCommand)

export const cleanupRooms = onSchedule('every 1 hours', async () => {
	await cleanupExpiredRooms()
	await cleanupExpiredRateLimits()
})
