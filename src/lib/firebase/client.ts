import {
	getApp,
	getApps,
	initializeApp,
	type FirebaseApp,
	type FirebaseOptions,
} from 'firebase/app'
import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check'
import {
	browserLocalPersistence,
	connectAuthEmulator,
	getAuth,
	setPersistence,
} from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

let emulatorConnected = false

const useEmulators = import.meta.env.MODE === 'test'
const demoConfig = {
	apiKey: 'demo-api-key',
	authDomain: 'demo-number-guessing.firebaseapp.com',
	projectId: 'demo-number-guessing',
	storageBucket: 'demo-number-guessing.appspot.com',
	messagingSenderId: '100000000000',
	appId: '1:100000000000:web:0000000000000000000000',
}

function createApp(config: FirebaseOptions): FirebaseApp {
	const app = initializeApp(config)
	// The emulators accept calls without App Check, and reCAPTCHA would reach
	// Google from tests; only a build with a site key opts in.
	const siteKey: string = useEmulators
		? ''
		: import.meta.env.PUBLIC_FIREBASE_APP_CHECK_SITE_KEY || ''
	if (siteKey) {
		initializeAppCheck(app, {
			provider: new ReCaptchaEnterpriseProvider(siteKey),
			isTokenAutoRefreshEnabled: true,
		})
	}
	return app
}

export async function getFirebaseClient() {
	if (typeof window === 'undefined') {
		throw new Error('FIREBASE_BROWSER_REQUIRED')
	}
	const config = {
		apiKey:
			import.meta.env.PUBLIC_FIREBASE_API_KEY ||
			(useEmulators ? demoConfig.apiKey : ''),
		authDomain:
			import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN ||
			(useEmulators ? demoConfig.authDomain : ''),
		projectId:
			import.meta.env.PUBLIC_FIREBASE_PROJECT_ID ||
			(useEmulators ? demoConfig.projectId : ''),
		storageBucket:
			import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET ||
			(useEmulators ? demoConfig.storageBucket : ''),
		messagingSenderId:
			import.meta.env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
			(useEmulators ? demoConfig.messagingSenderId : ''),
		appId:
			import.meta.env.PUBLIC_FIREBASE_APP_ID ||
			(useEmulators ? demoConfig.appId : ''),
	}
	const required = [config.apiKey, config.authDomain, config.projectId, config.appId]
	if (required.some((value) => !value)) {
		throw new Error('FIREBASE_CONFIG_MISSING')
	}
	const app = getApps().length ? getApp() : createApp(config)
	const auth = getAuth(app)
	const firestore = getFirestore(app)
	const functions = getFunctions(
		app,
		import.meta.env.PUBLIC_FIREBASE_FUNCTIONS_REGION || 'asia-southeast1',
	)
	if (useEmulators && !emulatorConnected) {
		connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
			disableWarnings: true,
		})
		connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
		connectFunctionsEmulator(functions, '127.0.0.1', 5001)
		emulatorConnected = true
	}
	await setPersistence(auth, browserLocalPersistence)
	return { auth, firestore, functions }
}
