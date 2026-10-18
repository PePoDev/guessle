import { test, expect, type Page } from '@playwright/test'

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

async function openGuessle(page: Page) {
	await page.goto('/')
	await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()
}

async function guess(page: Page, digits: string) {
	await page.keyboard.type(digits)
	await page.keyboard.press('Enter')
}

async function openRandom(page: Page) {
	await openGuessle(page)
	await page
		.getByRole('group', { name: 'Single-player type' })
		.getByRole('button', { name: 'Random' })
		.click()
	await expect(page.getByRole('heading', { name: '7 tries left' })).toBeVisible()
}

function pageOverflow(page: Page) {
	return page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight)
}

function panelOverflow(page: Page) {
	return page.getByRole('main').evaluate((panel) => panel.scrollHeight - panel.clientHeight)
}

function boardOverflow(page: Page) {
	return page
		.getByRole('list', { name: 'Guesses' })
		.evaluate((list) => list.parentElement!.scrollHeight - list.parentElement!.clientHeight)
}

async function sizes(page: Page, selector: string) {
	return page
		.locator(selector)
		.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))
}

const viewports = [
	{ width: 1280, height: 720 },
	{ width: 1440, height: 900 },
	{ width: 2000, height: 861 },
	{ width: 1024, height: 768 },
	{ width: 820, height: 1180 },
	{ width: 390, height: 844 },
	{ width: 360, height: 740 },
]

for (const viewport of viewports) {
	test(`fits Guessle in play to a ${viewport.width} × ${viewport.height} window`, async ({ page }) => {
		await page.setViewportSize(viewport)
		await openGuessle(page)
		await guess(page, '123')

		expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
		expect(await panelOverflow(page)).toBeLessThanOrEqual(0)
		const keypad = page.getByRole('group', { name: 'Number keypad' })
		await expect(keypad.getByRole('button', { name: 'Enter' })).toBeInViewport({ ratio: 1 })
		expect(Math.min(...(await sizes(page, '.tile')))).toBeGreaterThanOrEqual(32)
		expect(
			Math.min(
				...(await keypad
					.getByRole('button')
					.evaluateAll((keys) => keys.map((key) => key.getBoundingClientRect().height))),
			),
		).toBeGreaterThanOrEqual(44)
	})

	test(`fits Random in play to a ${viewport.width} × ${viewport.height} window`, async ({ page }) => {
		await page.setViewportSize(viewport)
		await openRandom(page)
		await guess(page, '123')

		await expect(page.getByRole('heading', { name: '6 tries left' })).toBeVisible()
		expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
		expect(await panelOverflow(page)).toBeLessThanOrEqual(0)
		// Desktop windows show all seven default rows; phones scroll the board under its shadows.
		if (viewport.width >= 900) {
			expect(await boardOverflow(page)).toBeLessThanOrEqual(0)
		}
		await expect(
			page.getByRole('group', { name: 'Number keypad' }).getByRole('button', { name: 'Enter' }),
		).toBeInViewport({ ratio: 1 })
		expect(Math.min(...(await sizes(page, '.tile')))).toBeGreaterThanOrEqual(32)
	})
}

test('adapts the stage between phone, tablet, and desktop', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await openRandom(page)
	const nav = page.getByRole('navigation', { name: 'Game navigation' })
	await expect(page.locator('.hero')).toBeHidden()
	expect(await nav.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
	for (const name of [/Single Player/, /Multiplayer/, /Instructions/]) {
		await expect(nav.getByRole('button', { name })).toBeInViewport({ ratio: 1 })
	}
	// Three cards in two columns: Instructions takes the second row whole.
	expect((await nav.getByRole('button', { name: /Instructions/ }).boundingBox())?.width).toBeCloseTo(
		(await nav.boundingBox())?.width ?? 0,
		0,
	)
	const ticker = page.locator('.ticker-seq').first()
	await expect(ticker).toHaveCSS('white-space', 'nowrap')
	expect((await ticker.boundingBox())?.height).toBeLessThan(40)

	await page.setViewportSize({ width: 840, height: 800 })
	const navTops = await nav
		.getByRole('button')
		.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top))
	expect(new Set(navTops).size).toBe(1)
	await expect(
		page.getByRole('group', { name: 'Number keypad' }).getByRole('button', { name: 'Enter' }),
	).toBeInViewport()
	const settingsIcon = await page.getByRole('button', { name: 'Open Random settings' }).boundingBox()
	const githubIcon = await page.getByRole('link', { name: /Open Guessle on GitHub/ }).boundingBox()
	expect(settingsIcon?.y).toBe(githubIcon?.y)
	expect(settingsIcon?.width).toBe(settingsIcon?.height)
	expect((githubIcon?.x ?? 0) - (settingsIcon?.x ?? 0) - (settingsIcon?.width ?? 0)).toBeLessThanOrEqual(12)

	await page.setViewportSize({ width: 640, height: 360 })
	await page.getByRole('button', { name: 'Open Random settings' }).click()
	await expect(page.getByRole('dialog')).toHaveCSS('overflow-y', 'auto')
	await page.getByRole('button', { name: 'Close', exact: true }).scrollIntoViewIfNeeded()
	await page.getByRole('button', { name: 'Close', exact: true }).click()

	await page.setViewportSize({ width: 1000, height: 800 })
	await expect(page.locator('.hero')).toBeVisible()
	// The three cards share the rail's full height.
	const rail = await nav.boundingBox()
	const lastCard = await nav.getByRole('button', { name: /Instructions/ }).boundingBox()
	expect((lastCard?.y ?? 0) + (lastCard?.height ?? 0)).toBeCloseTo((rail?.y ?? 0) + (rail?.height ?? 0), 0)
})

test('grows the tiles into a tall window and shrinks them in a short one', async ({ page }) => {
	await page.setViewportSize({ width: 1920, height: 1080 })
	await openGuessle(page)
	expect(Math.min(...(await sizes(page, '.tile')))).toBe(56)

	await page.setViewportSize({ width: 1280, height: 720 })
	await expect.poll(async () => Math.max(...(await sizes(page, '.tile')))).toBeLessThan(56)
	expect(await panelOverflow(page)).toBeLessThanOrEqual(0)
})

test('floats a warning over the board without resizing it', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 })
	await openGuessle(page)
	await guess(page, '123')
	const firstTile = page.locator('.tile').first()
	const before = await firstTile.boundingBox()

	await guess(page, '12')

	await expect(page.getByRole('alert')).toHaveText('Enter all 3 digits.')
	expect(await firstTile.boundingBox()).toEqual(before)
	expect(await panelOverflow(page)).toBeLessThanOrEqual(0)
	await expect(page.getByText('Enter all 3 digits.')).toBeInViewport()
})

test('shows a Random warning in the legend line without covering or resizing the board', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 })
	await openRandom(page)
	for (const digits of ['123', '456', '789', '012', '345']) {
		await guess(page, digits)
	}
	const rows = page.getByRole('list', { name: 'Guesses' }).getByRole('listitem')
	const current = rows.last()
	const before = await page.locator('.tile').first().boundingBox()

	await guess(page, '12')

	await expect(page.getByRole('alert')).toHaveText('Enter all 3 digits.')
	expect(await page.locator('.tile').first().boundingBox()).toEqual(before)
	const warning = await page.getByText('Enter all 3 digits.').boundingBox()
	const row = await current.boundingBox()
	expect(warning!.y + warning!.height).toBeLessThanOrEqual(row!.y)
})

test('shows only the rows played above the result without scrolling the page', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 })
	await openGuessle(page)
	await guess(page, '123')
	await guess(page, '273')

	await expect(page.getByText('Solved in 2 tries!')).toBeVisible()
	expect(await sizes(page, '.tile')).toHaveLength(6)
	expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
	expect(await panelOverflow(page)).toBeLessThanOrEqual(0)
	await expect(page.getByRole('timer')).toBeInViewport()
})

test('gives a finished Guessle at least as much room in a taller window', async ({ page }) => {
	await page.setViewportSize({ width: 1024, height: 1000 })
	await openGuessle(page)
	for (const digits of ['000', '111', '555', '666', '888', '999']) {
		await guess(page, digits)
	}
	await expect(page.getByText(/So close!/)).toBeVisible()
	const shortTile = Math.min(...(await sizes(page, '.tile')))
	expect(await panelOverflow(page)).toBeLessThanOrEqual(0)

	for (const height of [1127, 1128, 1366]) {
		await page.setViewportSize({ width: 1024, height })
		await expect.poll(async () => Math.min(...(await sizes(page, '.tile')))).toBeGreaterThanOrEqual(shortTile)
		expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
		expect(await panelOverflow(page)).toBeLessThanOrEqual(0)
	}
})

test('keeps a failed share warning beside the result, not over the board', async ({ page }) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: () => Promise.reject(new Error('blocked')) },
		})
	})
	await page.setViewportSize({ width: 1440, height: 900 })
	await openGuessle(page)
	await guess(page, '273')
	await page.getByRole('button', { name: 'Share' }).click()

	const warning = page.getByText("Couldn't share your result.", { exact: false })
	await expect(warning).toBeVisible()
	const board = await page.getByRole('list', { name: 'Guesses' }).boundingBox()
	const box = await warning.boundingBox()
	expect(box!.y).toBeGreaterThanOrEqual(board!.y + board!.height)
})

test('scrolls a long Random game inside its board, not the page or the panel', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 })
	await openRandom(page)
	await page.getByRole('button', { name: 'Open Random settings' }).click()
	await page.getByLabel('Max Attempts:').selectOption('20')
	await page.getByRole('button', { name: 'Close', exact: true }).click()
	// Closing Settings hands focus back to the gear, which would take a physical Enter.
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())

	for (const digits of ['123', '456', '789', '012', '345', '678', '901', '234']) {
		await guess(page, digits)
	}

	await expect(page.getByRole('heading', { name: '12 tries left' })).toBeVisible()
	expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
	expect(await panelOverflow(page)).toBeLessThanOrEqual(0)
	const board = page.getByRole('list', { name: 'Guesses' })
	expect(
		await board.evaluate((list) => list.parentElement!.scrollHeight > list.parentElement!.clientHeight),
	).toBe(true)
	await expect(board.getByRole('listitem').last()).toBeInViewport({ ratio: 1 })
})

test('ends a finished Random game with every row and the winning one in view', async ({ page }) => {
	await page.setViewportSize({ width: 768, height: 720 })
	await openRandom(page)
	for (const digits of ['123', '456', '789', '927', '793', '082', '500']) {
		await guess(page, digits)
	}

	await expect(page.getByRole('heading', { name: 'Solved in 7 tries!' })).toBeVisible()
	const rows = page.getByRole('list', { name: 'Guesses' }).getByRole('listitem')
	await expect(rows).toHaveCount(7)
	expect(await boardOverflow(page)).toBeLessThanOrEqual(0)
	await expect(rows.first()).toBeInViewport({ ratio: 1 })
	await expect(rows.last()).toBeInViewport({ ratio: 1 })
	await expect(page.getByRole('button', { name: 'Play again' })).toBeInViewport({ ratio: 1 })
	expect(await panelOverflow(page)).toBeLessThanOrEqual(0)
})

test('shows every row of a finished Random game on a phone instead of a nested scroll', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 740 })
	await openRandom(page)
	for (const digits of ['123', '456', '789', '012', '345', '678', '901']) {
		await guess(page, digits)
	}

	await expect(page.getByRole('heading', { name: 'Out of tries' })).toBeVisible()
	expect(await sizes(page, '.tile')).toHaveLength(21)
	expect(await boardOverflow(page)).toBeLessThanOrEqual(0)
	expect(Math.min(...(await sizes(page, '.tile')))).toBeGreaterThanOrEqual(32)
	expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
})

test('scrolls the panel, never the page, when its content cannot fit', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 })
	await openGuessle(page)
	await page.getByRole('button', { name: /Instructions/ }).click()

	expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
	const lastStep = page.getByRole('main').getByRole('listitem').last()
	await expect(lastStep).not.toBeInViewport()
	await page.getByRole('main').hover()
	await page.mouse.wheel(0, 1000)
	await expect(lastStep).toBeInViewport()
	expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
})

test('opens each screen at its top after the panel was scrolled', async ({ page }) => {
	await page.setViewportSize({ width: 360, height: 740 })
	await openGuessle(page)
	for (const digits of ['000', '111', '555', '666', '888', '999']) {
		await guess(page, digits)
	}
	await expect(page.getByText(/So close!/)).toBeVisible()
	await page.getByRole('main').evaluate((panel) => panel.scrollTo(0, panel.scrollHeight))
	expect(await page.getByRole('main').evaluate((panel) => panel.scrollTop)).toBeGreaterThan(0)

	await page.getByRole('button', { name: /Instructions/ }).click()

	await expect(page.getByRole('heading', { name: 'How to Play:' })).toBeInViewport()
	expect(await page.getByRole('main').evaluate((panel) => panel.scrollTop)).toBe(0)
})

test('wraps the still ticker so every label shows when motion is reduced', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' })
	await page.setViewportSize({ width: 390, height: 844 })
	await openGuessle(page)

	const ticker = page.locator('.ticker-seq').first()
	await expect(ticker).toHaveCSS('white-space', 'normal')
	expect(await ticker.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
	expect(await pageOverflow(page)).toBeLessThanOrEqual(0)
})

test('keeps the natural page flow on a phone held sideways', async ({ page }) => {
	await page.setViewportSize({ width: 844, height: 390 })
	await openGuessle(page)

	expect(await pageOverflow(page)).toBeGreaterThan(0)
	expect(await panelOverflow(page)).toBeLessThanOrEqual(0)
	const enter = page.getByRole('group', { name: 'Number keypad' }).getByRole('button', { name: 'Enter' })
	await enter.scrollIntoViewIfNeeded()
	await expect(enter).toBeInViewport({ ratio: 1 })
})
