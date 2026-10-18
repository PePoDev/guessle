import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => {
	const apps: Array<{ name: string }> = []
	return {
		apps,
		initializeApp: vi.fn(() => {
			const app = { name: '[DEFAULT]' }
			apps.push(app)
			return app
		}),
		initializeAppCheck: vi.fn(),
		ReCaptchaEnterpriseProvider: vi.fn(function (
			this: { siteKey: string },
			siteKey: string,
		) {
			this.siteKey = siteKey
		}),
		connectAuthEmulator: vi.fn(),
		connectFirestoreEmulator: vi.fn(),
		connectFunctionsEmulator: vi.fn(),
		getFunctions: vi.fn(() => ({ name: 'functions' })),
	}
})

vi.mock('firebase/app', () => ({
	getApp: () => sdk.apps[0],
	getApps: () => sdk.apps,
	initializeApp: sdk.initializeApp,
}))
vi.mock('firebase/app-check', () => ({
	initializeAppCheck: sdk.initializeAppCheck,
	ReCaptchaEnterpriseProvider: sdk.ReCaptchaEnterpriseProvider,
}))
vi.mock('firebase/auth', () => ({
	browserLocalPersistence: 'local',
	connectAuthEmulator: sdk.connectAuthEmulator,
	getAuth: () => ({ name: 'auth' }),
	setPersistence: async () => undefined,
}))
vi.mock('firebase/firestore', () => ({
	connectFirestoreEmulator: sdk.connectFirestoreEmulator,
	getFirestore: () => ({ name: 'firestore' }),
}))
vi.mock('firebase/functions', () => ({
	connectFunctionsEmulator: sdk.connectFunctionsEmulator,
	getFunctions: sdk.getFunctions,
}))

const productionConfig = {
	PUBLIC_FIREBASE_API_KEY: 'api-key',
	PUBLIC_FIREBASE_AUTH_DOMAIN: 'guessle.firebaseapp.com',
	PUBLIC_FIREBASE_PROJECT_ID: 'guessle',
	PUBLIC_FIREBASE_APP_ID: '1:2:web:3',
}

async function loadClient(env: Record<string, string>) {
	for (const [name, value] of Object.entries(env)) {
		vi.stubEnv(name, value)
	}
	vi.resetModules()
	return import('./client')
}

beforeEach(() => {
	sdk.apps.length = 0
	vi.clearAllMocks()
})

afterEach(() => {
	vi.unstubAllEnvs()
})

describe('getFirebaseClient', () => {
	it('attaches App Check with the reCAPTCHA Enterprise key from the build', async () => {
		const { getFirebaseClient } = await loadClient({
			...productionConfig,
			MODE: 'production',
			PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: 'site-key',
		})

		await getFirebaseClient()

		const app = sdk.initializeApp.mock.results[0]?.value
		expect(sdk.ReCaptchaEnterpriseProvider).toHaveBeenCalledWith('site-key')
		expect(sdk.initializeAppCheck).toHaveBeenCalledTimes(1)
		expect(sdk.initializeAppCheck).toHaveBeenCalledWith(app, {
			provider: expect.objectContaining({ siteKey: 'site-key' }),
			isTokenAutoRefreshEnabled: true,
		})
		expect(sdk.connectFunctionsEmulator).not.toHaveBeenCalled()
		expect(sdk.getFunctions).toHaveBeenCalledWith(app, 'asia-southeast1')
	})

	it('sets up App Check only once for the shared app', async () => {
		const { getFirebaseClient } = await loadClient({
			...productionConfig,
			MODE: 'production',
			PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: 'site-key',
		})

		await getFirebaseClient()
		await getFirebaseClient()

		expect(sdk.initializeApp).toHaveBeenCalledTimes(1)
		expect(sdk.initializeAppCheck).toHaveBeenCalledTimes(1)
	})

	it('skips App Check when the build has no site key', async () => {
		const { getFirebaseClient } = await loadClient({
			...productionConfig,
			MODE: 'production',
			PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: '',
		})

		await getFirebaseClient()

		expect(sdk.initializeApp).toHaveBeenCalledTimes(1)
		expect(sdk.initializeAppCheck).not.toHaveBeenCalled()
	})

	it('skips App Check against the emulators even with a site key', async () => {
		const { getFirebaseClient } = await loadClient({
			MODE: 'test',
			PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: 'site-key',
		})

		await getFirebaseClient()

		expect(sdk.initializeApp).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: 'demo-number-guessing' }),
		)
		expect(sdk.initializeAppCheck).not.toHaveBeenCalled()
		expect(sdk.connectFunctionsEmulator).toHaveBeenCalledWith(
			expect.anything(),
			'127.0.0.1',
			5001,
		)
	})

	it('refuses to start without the public Firebase config', async () => {
		const { getFirebaseClient } = await loadClient({
			MODE: 'production',
			PUBLIC_FIREBASE_API_KEY: '',
			PUBLIC_FIREBASE_AUTH_DOMAIN: '',
			PUBLIC_FIREBASE_PROJECT_ID: '',
			PUBLIC_FIREBASE_APP_ID: '',
		})

		await expect(getFirebaseClient()).rejects.toThrow('FIREBASE_CONFIG_MISSING')
		expect(sdk.initializeApp).not.toHaveBeenCalled()
		expect(sdk.initializeAppCheck).not.toHaveBeenCalled()
	})
})
