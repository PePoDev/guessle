import { expect, test, type Page } from '@playwright/test'

async function mockGitHubStars(page: Page) {
	await page.route(
		'https://api.github.com/repos/PePoDev/guessle',
		async (route) => {
			await route.fulfill({
				contentType: 'application/json',
				body: JSON.stringify({ stargazers_count: 128 }),
			})
		},
	)
}

async function selectOnlineMode(page: Page, playerCount = '2') {
	await page.getByRole('button', { name: /Multiplayer/ }).click()
	await page.getByRole('button', { name: 'Online', exact: true }).click()
	await page.getByLabel('Open Online Multiplayer settings').click()
	await page.getByLabel('Number of Players:').selectOption(playerCount)
	await page.getByText('Close', { exact: true }).click()
}

async function readRoomId(page: Page): Promise<string> {
	const roomId = (await page.getByTestId('room-id').textContent())?.trim() ?? ''
	expect(roomId).toMatch(/^[A-Z2-9]{6}$/)
	return roomId
}

const callables = [
	'createRoom',
	'joinRoom',
	'setSecret',
	'startRoom',
	'submitGuess',
	'leaveRoom',
	'restartRoom',
	'removeIdlePlayer',
]

// The Functions emulator boots a worker the first time each function is
// called, which takes seconds; paying that here keeps it out of the tests'
// waits. An unauthenticated call is enough, and the 401 shows the code ran.
test.beforeAll(async ({ playwright }) => {
	test.setTimeout(120_000)
	const api = await playwright.request.newContext({
		baseURL: 'http://127.0.0.1:5001/demo-number-guessing/asia-southeast1/',
	})
	const statuses = await Promise.all(
		callables.map(async (name) => {
			const response = await api.post(name, { data: { data: {} } })
			return response.status()
		}),
	)
	await api.dispose()
	expect(statuses).toEqual(callables.map(() => 401))
})

test('two remote players create, join, play, and finish a room', async ({
	browser,
}) => {
	// The first test also pays for the dev server's first load of the online code.
	test.slow()
	const hostContext = await browser.newContext()
	const guestContext = await browser.newContext()
	const host = await hostContext.newPage()
	const guest = await guestContext.newPage()

	await Promise.all([mockGitHubStars(host), mockGitHubStars(guest)])
	await host.goto('/')
	await selectOnlineMode(host)

	await host.getByLabel('Display name').fill('Ada')
	await host.getByRole('button', { name: 'Create Room' }).click()
	const roomId = await readRoomId(host)

	await guest.goto(`/?room=${roomId}`)
	await expect(
		guest.getByRole('button', { name: 'Online', exact: true }),
	).toHaveAttribute('aria-pressed', 'true')
	await expect(guest.getByLabel('Room ID')).toHaveValue(roomId)
	await guest.getByLabel('Display name').fill('Lin')
	await guest.getByRole('button', { name: 'Join Room' }).click()

	await expect(host.getByText('Lin', { exact: true })).toBeVisible()
	await host.getByLabel('Secret number').fill('1a2-3')
	await expect(host.getByLabel('Secret number')).toHaveValue('123')
	await host.getByRole('button', { name: 'Ready' }).click()
	await guest.getByLabel('Secret number').fill('456')
	await guest.getByRole('button', { name: 'Ready' }).click()
	await host.getByRole('button', { name: 'Start Game' }).click()

	await host.getByLabel('Target player').selectOption({ label: 'Lin' })
	await host.getByLabel('Guess', { exact: true }).fill('456')
	await host.getByRole('button', { name: 'Submit Guess' }).click()

	await expect(host.getByText('Ada wins!')).toBeVisible()
	await expect(guest.getByText('Ada wins!')).toBeVisible()

	await hostContext.close()
	await guestContext.close()
})

test('refresh reconnects the same browser to its room', async ({ browser }) => {
	const hostContext = await browser.newContext()
	const host = await hostContext.newPage()

	await mockGitHubStars(host)
	await host.goto('/')
	await selectOnlineMode(host)
	await host.getByLabel('Display name').fill('Ada')
	await host.getByRole('button', { name: 'Create Room' }).click()
	const roomId = await readRoomId(host)

	await host.reload()

	await expect(host.getByText(`Room ${roomId}`)).toBeVisible()
	await expect(host.getByText('Ada')).toBeVisible()
	await hostContext.close()
})

test('three players rotate turns and the last active player wins', async ({
	browser,
}) => {
	const hostContext = await browser.newContext()
	const secondContext = await browser.newContext()
	const thirdContext = await browser.newContext()
	const host = await hostContext.newPage()
	const second = await secondContext.newPage()
	const third = await thirdContext.newPage()

	await Promise.all([
		mockGitHubStars(host),
		mockGitHubStars(second),
		mockGitHubStars(third),
	])
	await Promise.all([host.goto('/'), second.goto('/'), third.goto('/')])
	await Promise.all([
		selectOnlineMode(host, '3'),
		selectOnlineMode(second, '3'),
		selectOnlineMode(third, '3'),
	])

	await host.getByLabel('Display name').fill('Ada')
	await host.getByRole('button', { name: 'Create Room' }).click()
	const roomId = await readRoomId(host)

	await second.getByLabel('Display name').fill('Lin')
	await second.getByLabel('Room ID').fill(roomId)
	await second.getByRole('button', { name: 'Join Room' }).click()
	await third.getByLabel('Display name').fill('Grace')
	await third.getByLabel('Room ID').fill(roomId)
	await third.getByRole('button', { name: 'Join Room' }).click()

	await host.getByLabel('Secret number').fill('111')
	await host.getByRole('button', { name: 'Ready' }).click()
	await second.getByLabel('Secret number').fill('222')
	await second.getByRole('button', { name: 'Ready' }).click()
	await third.getByLabel('Secret number').fill('333')
	await third.getByRole('button', { name: 'Ready' }).click()
	await host.getByRole('button', { name: 'Start Game' }).click()

	await host.getByLabel('Target player').selectOption({ label: 'Lin' })
	await host.getByLabel('Guess', { exact: true }).fill('999')
	await host.getByRole('button', { name: 'Submit Guess' }).click()
	await expect(second.getByText("Lin's turn")).toBeVisible()

	await second.getByLabel('Target player').selectOption({ label: 'Ada' })
	await second.getByLabel('Guess', { exact: true }).fill('111')
	await second.getByRole('button', { name: 'Submit Guess' }).click()
	await expect(second.getByText("Lin's turn")).toBeVisible()

	await second.getByLabel('Target player').selectOption({ label: 'Grace' })
	await second.getByLabel('Guess', { exact: true }).fill('333')
	await second.getByRole('button', { name: 'Submit Guess' }).click()
	await expect(host.getByText('Lin wins!')).toBeVisible()
	await expect(second.getByText('Lin wins!')).toBeVisible()
	await expect(third.getByText('Lin wins!')).toBeVisible()

	await Promise.all([
		hostContext.close(),
		secondContext.close(),
		thirdContext.close(),
	])
})

test('shows a friendly error for a missing room', async ({ page }) => {
	await mockGitHubStars(page)
	await page.goto('/')
	await selectOnlineMode(page)
	await page.getByLabel('Display name').fill('Ada')
	await page.getByLabel('Room ID').fill('ZZZZZZ')
	await page.getByRole('button', { name: 'Join Room' }).click()

	await expect(page.getByRole('alert')).toHaveText(
		'Room not found or expired.',
	)
})

test('an invited player reconnects after a refresh', async ({ browser }) => {
	const hostContext = await browser.newContext()
	const guestContext = await browser.newContext()
	const host = await hostContext.newPage()
	const guest = await guestContext.newPage()
	await Promise.all([mockGitHubStars(host), mockGitHubStars(guest)])

	await host.goto('/')
	await selectOnlineMode(host)
	await host.getByLabel('Display name').fill('Ada')
	await host.getByRole('button', { name: 'Create Room' }).click()
	const roomId = await readRoomId(host)

	await guest.goto(`/?room=${roomId}`)
	await guest.getByLabel('Display name').fill('Lin')
	await guest.getByRole('button', { name: 'Join Room' }).click()
	await expect(guest.getByText(`Room ${roomId}`)).toBeVisible()
	await expect(guest).toHaveURL(/\/$/)

	await guest.reload()

	await expect(guest.getByText(`Room ${roomId}`)).toBeVisible()
	await expect(guest.getByLabel('Display name')).toHaveCount(0)
	await Promise.all([hostContext.close(), guestContext.close()])
})

test('leaving mid-match forfeits to the remaining player', async ({
	browser,
}) => {
	const hostContext = await browser.newContext()
	const guestContext = await browser.newContext()
	const host = await hostContext.newPage()
	const guest = await guestContext.newPage()
	await Promise.all([mockGitHubStars(host), mockGitHubStars(guest)])

	await host.goto('/')
	await selectOnlineMode(host)
	await host.getByLabel('Display name').fill('Ada')
	await host.getByRole('button', { name: 'Create Room' }).click()
	const roomId = await readRoomId(host)
	await guest.goto(`/?room=${roomId}`)
	await guest.getByLabel('Display name').fill('Lin')
	await guest.getByRole('button', { name: 'Join Room' }).click()
	await host.getByLabel('Secret number').fill('123')
	await host.getByRole('button', { name: 'Ready' }).click()
	await guest.getByLabel('Secret number').fill('456')
	await guest.getByRole('button', { name: 'Ready' }).click()
	await host.getByRole('button', { name: 'Start Game' }).click()
	await expect(guest.getByText("Ada's turn")).toBeVisible()

	await guest.getByRole('button', { name: 'Leave game' }).click()
	await guest.getByRole('button', { name: 'Forfeit and leave' }).click()

	await expect(host.getByText('Ada wins!')).toBeVisible()
	await expect(guest.getByLabel('Display name')).toBeVisible()
	await Promise.all([hostContext.close(), guestContext.close()])
})

test('the host can start without a player who is not ready', async ({
	browser,
}) => {
	const contexts = await Promise.all([
		browser.newContext(),
		browser.newContext(),
		browser.newContext(),
	])
	const [host, second, third] = await Promise.all(
		contexts.map((context) => context.newPage()),
	)
	await Promise.all([host, second, third].map(mockGitHubStars))

	await host.goto('/')
	await selectOnlineMode(host, '3')
	await host.getByLabel('Display name').fill('Ada')
	await host.getByRole('button', { name: 'Create Room' }).click()
	const roomId = await readRoomId(host)
	for (const [page, name] of [
		[second, 'Lin'],
		[third, 'Grace'],
	] as const) {
		await page.goto(`/?room=${roomId}`)
		await page.getByLabel('Display name').fill(name)
		await page.getByRole('button', { name: 'Join Room' }).click()
		await expect(page.getByText(`Room ${roomId}`)).toBeVisible()
	}
	await host.getByLabel('Secret number').fill('123')
	await host.getByRole('button', { name: 'Ready' }).click()
	await second.getByLabel('Secret number').fill('456')
	await second.getByRole('button', { name: 'Ready' }).click()

	await expect(
		host.getByText("Players who aren't ready yet will be left out."),
	).toBeVisible()
	await host.getByRole('button', { name: 'Start Game' }).click()

	await expect(host.getByText("Ada's turn")).toBeVisible()
	await expect(host.getByLabel('Target player')).toHaveValue(/.+/)
	await expect(third.getByRole('alert')).toHaveText('Room not found or expired.')
	await Promise.all(contexts.map((context) => context.close()))
})
