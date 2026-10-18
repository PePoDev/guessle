import { expect, test, type Page, type Route } from '@playwright/test'

// Online play without a deployed backend, with no emulators: every Firebase
// request is answered here, so the spec runs in the normal e2e suite and
// never reaches a real project.

test.use({ timezoneId: 'Asia/Bangkok' })

const now = new Date('2026-10-14T09:00:00+07:00')
const unavailable =
	"Online play isn't available right now. Try Single Player or Local Multiplayer."

function encode(value: object): string {
	return Buffer.from(JSON.stringify(value)).toString('base64url')
}

// Unsigned like the Auth emulator's tokens; the SDK only reads its expiry.
function idToken(uid: string): string {
	const issuedAt = Math.floor(now.getTime() / 1000)
	return [
		encode({ alg: 'none', typ: 'JWT' }),
		encode({
			iss: 'https://securetoken.google.com/demo-number-guessing',
			aud: 'demo-number-guessing',
			auth_time: issuedAt,
			user_id: uid,
			sub: uid,
			iat: issuedAt,
			exp: issuedAt + 3600,
			firebase: { identities: {}, sign_in_provider: 'anonymous' },
		}),
		'',
	].join('.')
}

function authResponse(url: string): Record<string, unknown> {
	const token = idToken('guest')
	if (url.includes('accounts:signUp')) {
		return { idToken: token, refreshToken: 'refresh', expiresIn: '3600', localId: 'guest' }
	}
	if (url.includes('accounts:lookup')) {
		const at = String(now.getTime())
		return { users: [{ localId: 'guest', createdAt: at, lastLoginAt: at, providerUserInfo: [] }] }
	}
	return {
		id_token: token,
		access_token: token,
		refresh_token: 'refresh',
		expires_in: '3600',
		token_type: 'Bearer',
		user_id: 'guest',
	}
}

// Anonymous sign-in works, as it does in production, but no function exists.
// A function that was never deployed answers 404 without CORS headers, so the
// browser blocks the response and the SDK sees only a failed fetch. Playwright
// adds an allow-origin header to fulfilled responses that lack one, so this
// 404 allows another origin instead, which Chromium blocks the same way.
async function withoutFunctions(page: Page) {
	const backend = { signIn: true, signUps: 0, callables: [] as string[], corsBlocks: 0 }
	page.on('console', (message) => {
		if (message.type() === 'error' && message.text().includes('blocked by CORS policy')) {
			backend.corsBlocks += 1
		}
	})
	const auth = async (route: Route) => {
		const url = route.request().url()
		if (url.includes('accounts:signUp')) {
			backend.signUps += 1
		}
		if (!backend.signIn) {
			await route.abort('connectionrefused')
			return
		}
		await route.fulfill({
			headers: { 'access-control-allow-origin': '*' },
			contentType: 'application/json',
			body: JSON.stringify(authResponse(url)),
		})
	}
	const functions = async (route: Route) => {
		backend.callables.push(new URL(route.request().url()).pathname)
		await route.fulfill({
			status: 404,
			headers: { 'access-control-allow-origin': 'https://elsewhere.invalid' },
			contentType: 'text/html',
			body: '<!doctype html><title>404 Page not found</title>',
		})
	}
	await page.route('http://127.0.0.1:9099/**', auth)
	await page.route('https://identitytoolkit.googleapis.com/**', auth)
	await page.route('https://securetoken.googleapis.com/**', auth)
	await page.route('http://127.0.0.1:5001/**', functions)
	await page.route(/^https:\/\/[^/]+\.cloudfunctions\.net\//, functions)
	await page.route('http://127.0.0.1:8080/**', (route) => route.abort())
	await page.route('https://firestore.googleapis.com/**', (route) => route.abort())
	return backend
}

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(now)
	await page.addInitScript(() => {
		Math.random = () => 0.5
	})
	await page.route('https://api.github.com/repos/PePoDev/guessle', async (route) => {
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({ stargazers_count: 128 }),
		})
	})
})

test('says online play is unavailable and keeps focus on the message', async ({ page }) => {
	const backend = await withoutFunctions(page)
	await page.goto('/')
	await page.getByRole('button', { name: /Multiplayer/ }).click()
	await page.getByRole('button', { name: 'Online', exact: true }).click()
	await page.getByLabel('Display name').fill('Ada')
	await page.getByRole('button', { name: 'Create Room' }).focus()
	await page.keyboard.press('Enter')

	const alert = page.getByRole('alert')
	await expect(alert).toHaveText(unavailable)
	await expect(alert).toBeFocused()
	// The message must come from the blocked callable, not from missing config
	// or a 404 the browser was allowed to read.
	expect(backend.callables.some((path) => path.endsWith('/createRoom'))).toBe(true)
	expect(backend.corsBlocks).toBeGreaterThan(0)
	await expect(page.getByRole('button', { name: 'Create Room' })).toBeEnabled()

	await page.context().setOffline(true)
	await page.getByRole('button', { name: 'Create Room' }).click()

	await expect(alert).toHaveText(
		"Couldn't reach the game server. Check your connection and try again.",
	)
	await expect(alert).toBeFocused()
})

test('offers to retry or forget a saved room that cannot be restored', async ({ page }) => {
	const backend = await withoutFunctions(page)
	backend.signIn = false
	// Seeded once, so a reload shows whether forgetting the room stuck.
	await page.addInitScript(() => {
		if (!sessionStorage.getItem('seeded')) {
			sessionStorage.setItem('seeded', 'yes')
			localStorage.setItem('number-guessing-room-id', 'AB2C3D')
		}
	})
	await page.goto('/')

	await expect(page.getByRole('button', { name: 'Online', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true',
	)
	await expect(page.getByRole('heading', { name: 'Your saved room' })).toBeVisible()
	const alert = page.getByRole('alert')
	await expect(alert).toHaveText('Could not restore the room.')
	await expect(page.getByLabel('Display name')).toBeHidden()

	await page.getByRole('button', { name: 'Try again' }).click()

	await expect.poll(() => backend.signUps).toBe(2)
	await expect(alert).toHaveText('Could not restore the room.')
	await expect(alert).toBeFocused()

	await page.getByRole('button', { name: 'Forget this room' }).click()

	await expect(page.getByRole('heading', { name: 'Play with friends.' })).toBeFocused()
	await expect(page.getByLabel('Display name')).toBeVisible()
	await expect(alert).toHaveText('')
	expect(await page.evaluate(() => localStorage.getItem('number-guessing-room-id'))).toBeNull()

	await page.reload()

	await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()
})

test.describe('in a Thai browser', () => {
	test.use({ locale: 'th-TH' })

	test('says online play is unavailable in Thai', async ({ page }) => {
		await withoutFunctions(page)
		await page.goto('/')
		await page.getByRole('button', { name: /เล่นหลายคน/ }).click()
		await page.getByRole('button', { name: 'ออนไลน์', exact: true }).click()
		await page.getByLabel('ชื่อที่แสดง').fill('อลิซ')
		await page.getByRole('button', { name: 'สร้างห้อง' }).click()

		const alert = page.getByRole('alert')
		await expect(alert).toHaveText(
			'ตอนนี้ยังเล่นออนไลน์ไม่ได้ ลองเล่นคนเดียวหรือเล่นหลายคนในเครื่องเดียวก่อนนะ',
		)
		await expect(alert).toBeFocused()
	})
})
