import { deleteApp, getApp } from 'firebase-admin/app'
import type { CallableRequest } from 'firebase-functions/v2/https'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from './firestore.js'
import { createRoom } from './index.js'

const projectId = 'demo-number-guessing'

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

function createRoomRequest(app?: { appId: string }): CallableRequest {
	return {
		data: { name: 'Ada', digitCount: 3, maxPlayers: 2 },
		auth: { uid: 'host', token: {}, rawToken: 'token' },
		app,
		rawRequest: {},
		acceptsStreaming: false,
	} as unknown as CallableRequest
}

async function roomCount(): Promise<number> {
	return (await db.collection('rooms').get()).size
}

beforeEach(clearFirestore)
afterEach(() => {
	vi.unstubAllEnvs()
})
afterAll(() => deleteApp(getApp()))

describe('callable App Check enforcement', () => {
	it('serves calls without an App Check token while enforcement is off', async () => {
		await expect(createRoom.run(createRoomRequest())).resolves.toMatchObject({
			roomId: expect.stringMatching(/^[A-Z2-9]{6}$/),
		})
		expect(await roomCount()).toBe(1)
	})

	it('rejects calls without a verified App Check token once enforced', async () => {
		vi.stubEnv('ENFORCE_APP_CHECK', 'true')

		await expect(createRoom.run(createRoomRequest())).rejects.toMatchObject({
			code: 'unauthenticated',
			message: 'AUTH_REQUIRED',
		})
		expect(await roomCount()).toBe(0)
	})

	it('serves calls with a verified App Check token once enforced', async () => {
		vi.stubEnv('ENFORCE_APP_CHECK', 'true')

		await expect(
			createRoom.run(createRoomRequest({ appId: '1:100000000000:web:test' })),
		).resolves.toMatchObject({ roomId: expect.stringMatching(/^[A-Z2-9]{6}$/) })
		expect(await roomCount()).toBe(1)
	})
})
