import { test, expect, type Page } from '@playwright/test'

test.use({ timezoneId: 'Asia/Bangkok' })

const day1 = new Date('2026-10-14T09:00:00+07:00')
const day2 = new Date('2026-10-15T09:00:00+07:00')
const day4 = new Date('2026-10-17T09:00:00+07:00')

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(day1)
	await page.route('https://api.github.com/repos/PePoDev/guessle', async (route) => {
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({ stargazers_count: 128 }),
		})
	})
})

async function guess(page: Page, digits: string) {
	await page.keyboard.type(digits)
	await page.keyboard.press('Enter')
}

test("wins today's Guessle, keeps it after a reload, shares it, and continues the streak", async ({
	page,
	context,
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write'])
	await page.goto('/')

	await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()
	await guess(page, '123')
	await expect(page.getByRole('list', { name: 'Guesses' })).toContainText(
		'Guess 1: 1 not in the number, 2 in another spot, 3 in the right spot',
	)
	const keypad = page.getByRole('group', { name: 'Number keypad' })
	await expect(keypad.getByRole('button', { name: '1 not in the number' })).toBeVisible()
	await expect(keypad.getByRole('button', { name: '2 in another spot' })).toBeVisible()
	await expect(keypad.getByRole('button', { name: '3 in the right spot' })).toBeVisible()

	for (const digit of '273') {
		await keypad.getByRole('button', { name: new RegExp(`^${digit}`) }).click()
	}
	await keypad.getByRole('button', { name: 'Enter' }).click()

	await expect(page.getByText('Solved in 2 tries!')).toBeVisible()
	const confetti = page.locator('canvas.confetti')
	await expect(confetti).toBeAttached()
	await expect(confetti).toHaveAttribute('aria-hidden', 'true')
	await expect(confetti).toHaveCount(0)
	await expect(page.getByRole('region', { name: 'Statistics' })).toContainText('Current streak')
	await expect(page.getByRole('timer')).toHaveText('15:00:00')
	await page.getByRole('button', { name: 'Share' }).click()
	await expect(page.getByText('Copied!', { exact: true }).first()).toBeVisible()
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		'Guessle #1 2/6\n\n⬜🟨🟩\n🟩🟩🟩\n\nhttp://localhost:5173/',
	)

	await page.reload()
	await expect(page.getByText('Solved in 2 tries!')).toBeVisible()
	await expect(keypad).toHaveCount(0)
	await expect(confetti).toHaveCount(0)

	await page.clock.setFixedTime(day2)
	await page.reload()
	await expect(page.getByRole('heading', { name: 'Guessle #2' })).toBeVisible()
	await guess(page, '866')
	await expect(page.getByText('Got it in one!')).toBeVisible()
	await expect(page.getByRole('region', { name: 'Statistics' })).toContainText(
		/Played\s*2\s*Win %\s*100\s*Current streak\s*2\s*Max streak\s*2/,
	)
})

test('skips the confetti when the system asks for reduced motion', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.goto('/')
	await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()

	await guess(page, '273')

	await expect(page.getByText('Got it in one!')).toBeVisible()
	await expect(page.locator('canvas.confetti')).toHaveCount(0)
})

test('reveals the answer after six misses and offers Random', async ({ page }) => {
	await page.goto('/')
	await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()
	await guess(page, '12')
	await expect(page.getByRole('alert')).toHaveText('Enter all 3 digits.')
	await page.keyboard.press('Backspace')
	await page.keyboard.press('Backspace')

	for (const digits of ['000', '111', '555', '666', '888', '999']) {
		await guess(page, digits)
	}

	await expect(page.getByText('So close! The number was 273')).toBeVisible()
	await expect(page.locator('canvas.confetti')).toHaveCount(0)
	await page.getByRole('button', { name: 'Play Random' }).click()
	await expect(page.getByRole('heading', { name: '7 tries left' })).toBeFocused()
	await expect(
		page.getByRole('group', { name: 'Single-player type' }).getByRole('button', { name: 'Random' }),
	).toHaveAttribute('aria-pressed', 'true')
})

test("starts a fresh Random game after Guessle and keeps today's puzzle", async ({ page }) => {
	await page.addInitScript(() => {
		Math.random = () => 0.5
	})
	await page.goto('/')
	const variants = page.getByRole('group', { name: 'Single-player type' })
	const board = page.getByRole('list', { name: 'Guesses' })
	await variants.getByRole('button', { name: 'Random' }).click()
	await guess(page, '123')
	await expect(page.getByRole('heading', { name: '6 tries left' })).toBeVisible()
	await variants.getByRole('button', { name: 'Daily' }).click()
	await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()
	await guess(page, '123')
	await expect(board).toContainText('Guess 1: 1 not in the number')

	await variants.getByRole('button', { name: 'Random' }).click()

	await expect(page.getByRole('heading', { name: '7 tries left' })).toBeVisible()
	await expect(board).not.toContainText('Guess 1')
	await guess(page, '500')
	await expect(page.getByRole('heading', { name: 'Got it in one!' })).toBeVisible()

	await variants.getByRole('button', { name: 'Daily' }).click()
	await expect(board).toContainText('Guess 1: 1 not in the number')
	await page.reload()
	await expect(board).toContainText('Guess 1: 1 not in the number')
})

test('gives a puzzle saved with 5 digits a fresh board without counting the day twice', async ({
	page,
}) => {
	await page.clock.setFixedTime(day4)
	await page.goto('/')
	await expect(page.getByRole('heading', { name: 'Guessle #4' })).toBeVisible()
	await page.evaluate(() => {
		localStorage.setItem(
			'number-guessing-daily',
			JSON.stringify({
				day: 4,
				guesses: ['12345', '04937'],
				stats: {
					played: 4,
					wins: 4,
					currentStreak: 4,
					maxStreak: 4,
					distribution: [1, 2, 1, 0, 0, 0],
					lastPlayedDay: 4,
					lastWonDay: 4,
				},
			}),
		)
	})
	await page.reload()

	await expect(page.getByRole('heading', { name: 'Guessle #4' })).toBeVisible()
	await expect(page.getByRole('list', { name: 'Guesses' })).not.toContainText('Guess 1')
	await guess(page, '937')

	await expect(page.getByText('Got it in one!')).toBeVisible()
	await expect(page.getByRole('region', { name: 'Statistics' })).toContainText(
		/Played\s*4\s*Win %\s*100\s*Current streak\s*4\s*Max streak\s*4/,
	)
})

test('fits the board and keypad on a phone', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 740 })
	await page.goto('/')
	await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()

	const main = page.getByRole('main')
	expect(await main.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
	const keys = await page
		.getByRole('group', { name: 'Number keypad' })
		.getByRole('button')
		.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height))
	expect(keys).toHaveLength(12)
	expect(Math.min(...keys)).toBeGreaterThanOrEqual(44)
})
