import { expect, test } from '@playwright/test'

test.use({ timezoneId: 'Asia/Bangkok' })

test.beforeEach(async ({ page }) => {
	await page.clock.setFixedTime(new Date('2026-10-14T09:00:00+07:00'))
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

test('shows Page not found for an unknown path with a link back to the game', async ({
	page,
}) => {
	const response = await page.goto('/no-such-page')

	expect(response?.status()).toBe(404)
	await expect(
		page.getByRole('heading', { level: 1, name: 'Page not found' }),
	).toBeVisible()
	await expect(page).toHaveTitle('Page not found · Guessle')

	await page.getByRole('link', { name: 'Back to the game' }).click()

	await expect(page).toHaveURL('/')
	await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()
})

test.describe('in a Thai browser', () => {
	test.use({ locale: 'th-TH' })

	test('shows the not-found screen in Thai', async ({ page }) => {
		await page.goto('/no/such/page')

		await expect(page.locator('html')).toHaveAttribute('lang', 'th')
		await expect(
			page.getByRole('heading', { level: 1, name: 'ไม่พบหน้านี้' }),
		).toBeVisible()
		await page.getByRole('link', { name: 'กลับไปที่เกม' }).click()
		await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()
	})
})
