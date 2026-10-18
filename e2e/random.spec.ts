import { test, expect, type Page } from '@playwright/test'

test.use({ timezoneId: 'Asia/Bangkok' })

type ChimeCounter = Window & { chimes?: number }

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

// Guessle opens by default, so every flow taps Random first. Math.random is
// pinned to 0.5, so a three-digit number is 500.
async function openRandom(page: Page) {
	await page.goto('/')
	await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()
	await page
		.getByRole('group', { name: 'Single-player type' })
		.getByRole('button', { name: 'Random' })
		.click()
	await expect(page.getByRole('heading', { name: '7 tries left' })).toBeVisible()
}

async function guess(page: Page, digits: string) {
	await page.keyboard.type(digits)
	await page.keyboard.press('Enter')
}

async function changeSetting(page: Page, label: string, value: string) {
	await page.getByRole('button', { name: 'Open Random settings' }).click()
	await page.getByLabel(label).selectOption(value)
	await page.getByRole('button', { name: 'Close', exact: true }).click()
}

// The chime is synthesized, so counting new audio contexts is how a test hears it.
async function listenForChimes(page: Page) {
	await page.addInitScript(() => {
		const counter: ChimeCounter = window
		const NativeAudioContext = window.AudioContext
		counter.chimes = 0
		window.AudioContext = class extends NativeAudioContext {
			constructor(options?: AudioContextOptions) {
				super(options)
				counter.chimes = (counter.chimes ?? 0) + 1
			}
		}
	})
}

function chimes(page: Page) {
	return page.evaluate(() => (window as ChimeCounter).chimes)
}

test('switches to Random with a tap and plays from the physical keyboard', async ({ page }) => {
	await openRandom(page)

	const random = page
		.getByRole('group', { name: 'Single-player type' })
		.getByRole('button', { name: 'Random' })
	await expect(random).toHaveAttribute('aria-pressed', 'true')
	await expect(random).not.toBeFocused()
	await expect(page.getByText('in the number', { exact: true })).toBeVisible()
	await expect(page.getByText('in the right spot', { exact: true })).toBeVisible()

	await guess(page, '123')
	await guess(page, '051')
	await guess(page, '520')

	const board = page.getByRole('list', { name: 'Guesses' })
	await expect(board).toContainText('Guess 1: 1 2 3, 0 in the number, 0 in the right spot')
	await expect(board).toContainText('Guess 2: 0 5 1, 2 in the number, 0 in the right spot')
	await expect(board).toContainText('Guess 3: 5 2 0, 2 in the number, 2 in the right spot')
	await expect(page.getByRole('heading', { name: '4 tries left' })).toBeVisible()
})

test('rejects short and repeated guesses without using a try', async ({ page }) => {
	await openRandom(page)
	const board = page.getByRole('list', { name: 'Guesses' })

	await guess(page, '1a2')
	await expect(page.getByRole('alert')).toHaveText('Enter all 3 digits.')
	await expect(board).toContainText('Current guess: 1 2')
	await page.keyboard.press('Backspace')
	await guess(page, '23')
	await expect(board).toContainText('Guess 1: 1 2 3, 0 in the number, 0 in the right spot')
	await expect(page.getByRole('alert')).toHaveText('')

	await guess(page, '123')
	await expect(page.getByRole('alert')).toHaveText("You've already tried 123.")
	await expect(board).not.toContainText('Guess 2')
	await expect(page.getByRole('heading', { name: '6 tries left' })).toBeVisible()

	await page.keyboard.press('Backspace')
	await expect(page.getByRole('alert')).toHaveText('')
	await guess(page, '4')
	await expect(board).toContainText('Guess 2: 1 2 4, 0 in the number, 0 in the right spot')
})

test('celebrates a win and draws a fresh number with Play again', async ({ page }) => {
	await listenForChimes(page)
	await openRandom(page)

	await guess(page, '123')
	await guess(page, '500')

	await expect(page.getByRole('heading', { name: 'Solved in 2 tries!' })).toBeVisible()
	await expect(page.locator(':focus')).toContainText('The number was 500')
	const confetti = page.locator('canvas.confetti')
	await expect(confetti).toBeAttached()
	await expect(confetti).toHaveAttribute('aria-hidden', 'true')
	expect(await chimes(page)).toBe(1)
	await expect(page.getByRole('group', { name: 'Number keypad' })).toHaveCount(0)
	await expect(page.getByRole('list', { name: 'Guesses' }).getByRole('listitem')).toHaveCount(2)
	await expect(confetti).toHaveCount(0)

	await page.evaluate(() => {
		Math.random = () => 0.25
	})
	await page.getByRole('button', { name: 'Play again' }).click()

	await expect(page.getByRole('heading', { name: '7 tries left' })).toBeFocused()
	const board = page.getByRole('list', { name: 'Guesses' })
	await expect(board).not.toContainText('Guess 1')
	await guess(page, '500')
	await expect(board).toContainText('Guess 1: 5 0 0, 2 in the number, 1 in the right spot')
	await guess(page, '250')
	await expect(page.getByRole('heading', { name: 'Solved in 2 tries!' })).toBeVisible()
	await expect(page.getByText('The number was 250')).toBeVisible()
})

test('reveals the number after the last attempt', async ({ page }) => {
	await listenForChimes(page)
	await openRandom(page)

	for (const digits of ['123', '456', '789', '012', '345', '678']) {
		await guess(page, digits)
	}
	await expect(page.getByRole('heading', { name: '1 try left' })).toBeVisible()
	await guess(page, '901')

	await expect(page.getByText('The number was 500')).toBeVisible()
	await expect(page.getByRole('heading', { name: 'Out of tries' })).toBeVisible()
	await expect(page.getByRole('group', { name: 'Number keypad' })).toHaveCount(0)
	await expect(page.getByRole('list', { name: 'Guesses' }).getByRole('listitem')).toHaveCount(7)
	await expect(page.locator('canvas.confetti')).toHaveCount(0)
	expect(await chimes(page)).toBe(0)

	await page.getByRole('button', { name: 'Play again' }).click()
	await expect(page.getByRole('heading', { name: '7 tries left' })).toBeFocused()
	await expect(page.getByRole('group', { name: 'Number keypad' })).toBeVisible()
})

test('changes the digits and attempts in Settings', async ({ page }) => {
	await openRandom(page)
	await page.getByRole('button', { name: 'Open Random settings' }).click()
	await expect(page.getByRole('dialog', { name: 'Random Settings' })).toBeVisible()
	await expect(page.getByLabel('Number of Digits:')).toHaveValue('3')
	await expect(page.getByLabel('Max Attempts:')).toHaveValue('7')
	await page.getByLabel('Number of Digits:').selectOption('5')
	await page.getByLabel('Max Attempts:').selectOption('20')
	await page.getByRole('button', { name: 'Close', exact: true }).click()

	await expect(page.getByRole('heading', { name: '20 tries left' })).toBeVisible()
	await expect(page.getByText(/I'm thinking of a/)).toHaveText(
		"I'm thinking of a 5-digit number. Can you guess it?",
	)
	// Closing Settings returns focus to its button, so the on-screen Enter submits.
	await page.keyboard.type('123456')
	await page.getByRole('group', { name: 'Number keypad' }).getByRole('button', { name: 'Enter' }).click()

	await expect(page.getByRole('list', { name: 'Guesses' })).toContainText(
		'Guess 1: 1 2 3 4 5, 1 in the number, 0 in the right spot',
	)
	await expect(page.getByRole('heading', { name: '19 tries left' })).toBeVisible()
	await guess(page, '50000')
	await expect(page.getByText('The number was 50000')).toBeVisible()
})

test('keeps the game through Settings and Instructions', async ({
	page,
}) => {
	await openRandom(page)
	await guess(page, '123')
	const board = page.getByRole('list', { name: 'Guesses' })
	await expect(board).toContainText('Guess 1: 1 2 3')

	await page.getByRole('button', { name: 'Open Random settings' }).click()
	await page.getByRole('button', { name: 'Close', exact: true }).click()
	await page.getByRole('button', { name: /Instructions/ }).click()
	await expect(page.getByRole('heading', { name: 'Random:' })).toBeVisible()
	await page.getByRole('button', { name: /Instructions/ }).click()
	await expect(page.getByRole('heading', { name: 'How to Play:' })).toBeHidden()
	await expect(board).toContainText('Guess 1: 1 2 3')
	await expect(page.getByRole('heading', { name: '6 tries left' })).toBeVisible()

	// A tapped nav card lets go of focus, so a physical Enter still submits the guess.
	await guess(page, '500')
	await expect(page.getByRole('heading', { name: 'Solved in 2 tries!' })).toBeVisible()
})

test('keeps keyboard focus on the switch as it moves between boards', async ({ page }) => {
	await page.goto('/')
	await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()
	const variants = page.getByRole('group', { name: 'Single-player type' })
	const daily = variants.getByRole('button', { name: 'Daily' })
	const random = variants.getByRole('button', { name: 'Random' })

	await daily.focus()
	await page.keyboard.press('Tab')
	await expect(random).toBeFocused()
	await page.keyboard.press('Enter')

	await expect(page.getByRole('heading', { name: '7 tries left' })).toBeVisible()
	await expect(random).toHaveAttribute('aria-pressed', 'true')
	await expect(random).toBeFocused()
	await expect(page.getByRole('alert')).toHaveText('')

	await page.keyboard.press('Shift+Tab')
	await expect(daily).toBeFocused()
	await page.keyboard.press('Space')

	await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()
	await expect(daily).toHaveAttribute('aria-pressed', 'true')
	await expect(daily).toBeFocused()
})

test('saves the sound setting and stays quiet when it is off', async ({ page }) => {
	await listenForChimes(page)
	await openRandom(page)
	await page.getByRole('button', { name: 'Open Random settings' }).click()
	const sound = page.getByLabel('Sound effects:')
	await expect(sound).toHaveValue('on')
	await sound.selectOption('Off')
	await page.getByRole('button', { name: 'Close', exact: true }).click()

	await page.reload()
	await openRandom(page)
	await page.getByRole('button', { name: 'Open Random settings' }).click()
	await expect(sound).toHaveValue('off')
	await page.getByRole('button', { name: 'Close', exact: true }).click()

	// Settings opened with a tap hands focus back to nothing, so Enter submits instead of reopening it.
	await guess(page, '500')
	await expect(page.getByRole('heading', { name: 'Got it in one!' })).toBeVisible()
	await expect(page.locator('canvas.confetti')).toBeAttached()
	expect(await chimes(page)).toBe(0)
})

test.describe('in a Thai browser', () => {
	test.use({ locale: 'th-TH' })

	test('shows Random in Thai', async ({ page }) => {
		await page.goto('/')
		await expect(page.getByRole('heading', { name: 'Guessle #1' })).toBeVisible()
		await page
			.getByRole('group', { name: 'รูปแบบการเล่นคนเดียว' })
			.getByRole('button', { name: 'สุ่ม' })
			.click()

		await expect(page.getByRole('heading', { name: 'เหลือ 7 ครั้ง' })).toBeVisible()
		await expect(page.getByText('มีในคำตอบ', { exact: true })).toBeVisible()
		await expect(page.getByText('ถูกตำแหน่ง', { exact: true })).toBeVisible()
		await guess(page, '123')
		await expect(page.getByRole('list', { name: 'คำทาย' })).toContainText(
			'ครั้งที่ 1: 1 2 3 มีในคำตอบ 0 ตัว ถูกตำแหน่ง 0 ตัว',
		)
		await expect(page.getByRole('heading', { name: 'เหลือ 6 ครั้ง' })).toBeVisible()
		await guess(page, '12')
		await expect(page.getByRole('alert')).toHaveText('กรอกให้ครบ 3 หลัก')

		const keypad = page.getByRole('group', { name: 'แป้นตัวเลข' })
		await keypad.getByRole('button', { name: 'ลบ' }).click()
		await keypad.getByRole('button', { name: 'ลบ' }).click()
		await page.keyboard.type('500')
		await keypad.getByRole('button', { name: 'ส่ง' }).click()

		await expect(page.getByRole('heading', { name: 'ทายถูกใน 2 ครั้ง!' })).toBeVisible()
		await expect(page.getByText('คำตอบคือ 500')).toBeVisible()
		await expect(page.getByRole('button', { name: 'เล่นอีกครั้ง' })).toBeVisible()

		await page.getByRole('button', { name: 'เปิดการตั้งค่าโหมดสุ่มเลข' }).click()
		await expect(page.getByRole('dialog', { name: 'ตั้งค่าโหมดสุ่มเลข' })).toBeVisible()
		await expect(page.getByLabel('เสียงประกอบ:')).toHaveValue('on')
	})
})
