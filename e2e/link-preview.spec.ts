import { test, expect } from '@playwright/test'

test.use({ timezoneId: 'Asia/Bangkok' })

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date('2026-10-14T09:00:00+07:00'))
	await page.route('https://api.github.com/repos/PePoDev/guessle', async (route) => {
		await route.fulfill({
			contentType: 'application/json',
			body: JSON.stringify({ stargazers_count: 128 }),
		})
	})
})

test('serves the share image and site icons that the page links', async ({ page, request }) => {
	await page.goto('/')
	const image = await page.locator('meta[property="og:image"]').getAttribute('content')
	const links = await page
		.locator('link[rel="icon"], link[rel="apple-touch-icon"]')
		.evaluateAll((elements) => elements.map((element) => element.getAttribute('href') ?? ''))

	const paths = [new URL(image ?? '').pathname, ...links]
	expect(paths).toEqual(['/og-image.png', '/favicon.ico', '/favicon.svg', '/apple-touch-icon.png'])
	for (const path of paths) {
		const response = await request.get(path)
		expect(response.status(), path).toBe(200)
		expect((await response.body()).length, path).toBeGreaterThan(0)
	}
})

test('keeps one title that follows the language', async ({ page }) => {
	await page.goto('/')
	await expect(page).toHaveTitle('Guessle: Daily Number Puzzle')
	await expect(page.locator('title')).toHaveCount(1)

	await page.getByRole('button', { name: 'Open Daily Guessle settings' }).click()
	await page.getByLabel('Language:').selectOption('th')
	await expect(page).toHaveTitle('Guessle: เกมทายเลขรายวัน')
	await expect(page.locator('title')).toHaveCount(1)
})
