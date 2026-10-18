import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { tick } from 'svelte'
import OnlineMultiplayerGame from './OnlineMultiplayerGame.svelte'
import { gameStore } from '$lib/stores/gameStore'
import type { OnlineSnapshot } from '$lib/online/types'
import type { OnlineGameService } from '$lib/services/onlineGameService'

function createFakeOnlineGameService(input?: {
	createRoomResult?: { uid: string; roomId: string }
	joinRoomResult?: { uid: string; roomId: string }
	restoreSessionResult?: { uid: string; roomId: string } | null
}): OnlineGameService {
	return {
		restoreSession: vi.fn(async () => input?.restoreSessionResult ?? null),
		createRoom: vi.fn(async () =>
			input?.createRoomResult ?? { uid: 'host', roomId: 'AB2C3D' },
		),
		joinRoom: vi.fn(async () =>
			input?.joinRoomResult ?? { uid: 'p2', roomId: 'AB2C3D' },
		),
		setSecret: vi.fn(async () => undefined),
		startRoom: vi.fn(async () => undefined),
		submitGuess: vi.fn(async () => undefined),
		leaveRoom: vi.fn(async () => undefined),
		restartRoom: vi.fn(async () => undefined),
		removeIdlePlayer: vi.fn(async () => undefined),
		savedRoomId: vi.fn(() => input?.restoreSessionResult?.roomId ?? ''),
		clearSession: vi.fn(),
		subscribeToRoom: vi.fn(() => vi.fn()),
	}
}

function readyLobbySnapshot(hostReady = true): OnlineSnapshot {
	return {
		room: {
			id: 'AB2C3D',
			hostUid: 'host',
			phase: 'lobby',
			digitCount: 3,
			maxPlayers: 2,
			playerOrder: ['host', 'p2'],
			currentGuesserUid: null,
			winnerUid: null,
			turnNumber: 0,
		},
		players: [
			{
				uid: 'host',
				name: 'Ada',
				seat: 0,
				ready: hostReady,
				eliminated: false,
			},
			{
				uid: 'p2',
				name: 'Lin',
				seat: 1,
				ready: true,
				eliminated: false,
			},
		],
		guesses: [],
	}
}

function guessingSnapshot(input: {
	currentGuesserUid: string
	turnNumber?: number
}): OnlineSnapshot {
	return {
		room: {
			id: 'AB2C3D',
			hostUid: 'host',
			phase: 'guessing',
			digitCount: 3,
			maxPlayers: 2,
			playerOrder: ['host', 'p2'],
			currentGuesserUid: input.currentGuesserUid,
			winnerUid: null,
			turnNumber: input.turnNumber ?? 0,
		},
		players: [
			{
				uid: 'host',
				name: 'Ada',
				seat: 0,
				ready: true,
				eliminated: false,
			},
			{
				uid: 'p2',
				name: 'Lin',
				seat: 1,
				ready: true,
				eliminated: false,
			},
		],
		guesses: [],
	}
}

function finishedSnapshot(input: { winnerUid: string }): OnlineSnapshot {
	const snapshot = guessingSnapshot({
		currentGuesserUid: input.winnerUid,
		turnNumber: 1,
	})
	return {
		...snapshot,
		room: {
			...snapshot.room,
			phase: 'finished',
			currentGuesserUid: null,
			winnerUid: input.winnerUid,
		},
		players: snapshot.players.map((player) => ({
			...player,
			eliminated: player.uid !== input.winnerUid,
		})),
		guesses: [
			{
				id: 'turn-1',
				turnNumber: 1,
				guesserUid: input.winnerUid,
				targetUid: input.winnerUid === 'host' ? 'p2' : 'host',
				guess: '456',
				correct: true,
				correctDigits: 3,
				correctPositions: 3,
			},
		],
	}
}

beforeEach(() => {
	gameStore.reset()
	gameStore.setMode('online')
	gameStore.updateSettings({ digitCount: 3, playerCount: 2 })
})

afterEach(() => {
	vi.useRealTimers()
})

it('creates a room from the entered name', async () => {
	const service = createFakeOnlineGameService({
		createRoomResult: { uid: 'host', roomId: 'AB2C3D' },
	})
	const user = userEvent.setup()
	render(OnlineMultiplayerGame, { props: { service } })

	await user.type(screen.getByLabelText('Display name'), 'Ada')
	await user.click(screen.getByRole('button', { name: 'Create Room' }))

	expect(service.createRoom).toHaveBeenCalledWith({
		name: 'Ada',
		digitCount: 3,
		maxPlayers: 2,
	})
})

it('normalizes and joins a room', async () => {
	const service = createFakeOnlineGameService({
		joinRoomResult: { uid: 'p2', roomId: 'AB2C3D' },
	})
	const user = userEvent.setup()
	render(OnlineMultiplayerGame, { props: { service } })

	await user.type(screen.getByLabelText('Display name'), 'Lin')
	await user.type(screen.getByLabelText('Room ID'), 'ab2c3d')
	await user.click(screen.getByRole('button', { name: 'Join Room' }))

	expect(service.joinRoom).toHaveBeenCalledWith({
		name: 'Lin',
		roomId: 'AB2C3D',
	})
})

it('pre-fills an invited room without restoring another session', () => {
	const service = createFakeOnlineGameService({
		restoreSessionResult: { uid: 'old-player', roomId: 'ZZZZZZ' },
	})

	render(OnlineMultiplayerGame, {
		props: { service, initialRoomId: 'AB2C3D' },
	})

	expect(screen.getByLabelText('Room ID')).toHaveValue('AB2C3D')
	expect(service.restoreSession).not.toHaveBeenCalled()
})

it('shows lobby readiness and lets the host start', async () => {
	const service = createFakeOnlineGameService()
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	const user = userEvent.setup()
	render(OnlineMultiplayerGame, { props: { service } })

	expect(
		screen.getByRole('heading', { name: 'Room AB2C3D' }),
	).toBeInTheDocument()
	expect(screen.getByText('2 / 2 players')).toBeInTheDocument()
	await user.type(screen.getByLabelText('Secret number'), '123')
	await user.click(screen.getByRole('button', { name: 'Ready' }))
	gameStore.applyOnlineSnapshot(readyLobbySnapshot())
	await user.click(screen.getByRole('button', { name: 'Start Game' }))

	expect(service.setSecret).toHaveBeenCalledWith({
		roomId: 'AB2C3D',
		number: '123',
	})
	expect(service.startRoom).toHaveBeenCalledWith('AB2C3D')
})

it('keeps only digits in online secret numbers', async () => {
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})
	const input = screen.getByLabelText('Secret number')

	await fireEvent.input(input, { target: { value: '0a1-2' } })

	expect(input).toHaveValue('012')
})

it('copies the room ID and temporarily shows a confirmation tooltip', async () => {
	vi.useFakeTimers()
	const writeText = vi.fn(async () => undefined)
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText },
	})
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	await fireEvent.click(screen.getByRole('button', { name: 'Copy Room ID' }))
	await Promise.resolve()

	expect(writeText).toHaveBeenCalledWith('AB2C3D')
	expect(screen.getByRole('status')).toHaveTextContent('Copied!')

	await vi.advanceTimersByTimeAsync(2000)
	await tick()
	expect(screen.queryByText('Copied!')).not.toBeInTheDocument()
})

it('shows an error when the room ID cannot be copied', async () => {
	const user = userEvent.setup()
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: {
			writeText: vi.fn(async () => {
				throw new Error('Clipboard unavailable.')
			}),
		},
	})
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	await user.click(screen.getByRole('button', { name: 'Copy Room ID' }))

	expect(await screen.findByRole('alert')).toHaveTextContent(
		'Could not copy. Please copy it manually.',
	)
})

it('shares the room invite link when native sharing is available', async () => {
	const user = userEvent.setup()
	const share = vi.fn(async () => undefined)
	const writeText = vi.fn(async () => undefined)
	Object.defineProperty(navigator, 'share', {
		configurable: true,
		value: share,
	})
	Object.defineProperty(navigator, 'clipboard', {
		configurable: true,
		value: { writeText },
	})
	window.history.replaceState({}, '', '/')
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	await user.click(screen.getByRole('button', { name: 'Share' }))

	expect(share).toHaveBeenCalledWith({
		title: 'Guessle: Daily Number Puzzle',
		text: 'Join my Guessle room AB2C3D.',
		url: `${window.location.origin}/?room=AB2C3D`,
	})
	expect(writeText).not.toHaveBeenCalled()
})

it.each([
	['unavailable', undefined],
	[
		'rejected',
		vi.fn(async () => {
			throw new Error('Share cancelled.')
		}),
	],
])(
	'copies the invite link when native sharing is %s',
	async (_scenario, share) => {
		const user = userEvent.setup()
		const writeText = vi.fn(async () => undefined)
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: share,
		})
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText },
		})
		window.history.replaceState({}, '', '/')
		gameStore.setOnlineIdentity('host', 'AB2C3D')
		gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
		render(OnlineMultiplayerGame, {
			props: { service: createFakeOnlineGameService() },
		})

		await user.click(screen.getByRole('button', { name: 'Share' }))

		expect(writeText).toHaveBeenCalledWith(
			`${window.location.origin}/?room=AB2C3D`,
		)
		expect(screen.getByRole('status')).toHaveTextContent('Link copied!')
	},
)

it('keeps one room subscription while snapshots update', async () => {
	const service = createFakeOnlineGameService()
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	render(OnlineMultiplayerGame, { props: { service } })

	await waitFor(() => {
		expect(service.subscribeToRoom).toHaveBeenCalledTimes(1)
	})
	gameStore.applyOnlineSnapshot(readyLobbySnapshot())
	await tick()

	expect(service.subscribeToRoom).toHaveBeenCalledTimes(1)
})

it('submits a guess with Enter for the active player', async () => {
	const service = createFakeOnlineGameService()
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(
		guessingSnapshot({ currentGuesserUid: 'host' }),
	)
	const user = userEvent.setup()
	render(OnlineMultiplayerGame, { props: { service } })

	await user.selectOptions(screen.getByLabelText('Target player'), 'p2')
	await user.type(screen.getByLabelText('Guess'), '456{Enter}')

	expect(service.submitGuess).toHaveBeenCalledWith({
		roomId: 'AB2C3D',
		targetUid: 'p2',
		guess: '456',
		turnNumber: 0,
	})
})

it('keeps only digits in online guesses', async () => {
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(
		guessingSnapshot({ currentGuesserUid: 'host' }),
	)
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})
	const input = screen.getByLabelText('Guess')

	await fireEvent.input(input, { target: { value: '4x5-6' } })

	expect(input).toHaveValue('456')
})

it('shows a waiting state for another player turn', () => {
	gameStore.setOnlineIdentity('p2', 'AB2C3D')
	gameStore.applyOnlineSnapshot(
		guessingSnapshot({ currentGuesserUid: 'host' }),
	)
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	expect(screen.getByText("Ada's turn")).toBeInTheDocument()
	expect(screen.getByLabelText('Guess')).toBeDisabled()
})

it('marks the newest online guess in history', () => {
	const snapshot = guessingSnapshot({ currentGuesserUid: 'host' })
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot({
		...snapshot,
		guesses: [
			{
				id: 'turn-1',
				turnNumber: 1,
				guesserUid: 'host',
				targetUid: 'p2',
				guess: '111',
				correct: false,
				correctDigits: 1,
				correctPositions: 0,
			},
		],
	})
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	const row = screen.getByText(/1 digits, 0 positions/).closest('li')
	expect(row).toHaveClass('history-row-newest')
})

it('shows the winner and host restart action', async () => {
	const service = createFakeOnlineGameService()
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(finishedSnapshot({ winnerUid: 'host' }))
	const user = userEvent.setup()
	render(OnlineMultiplayerGame, { props: { service } })

	expect(screen.getByText('Ada wins!')).toBeInTheDocument()
	await user.click(screen.getByRole('button', { name: 'Play Again' }))
	expect(service.restartRoom).toHaveBeenCalledWith('AB2C3D')
})

it('restores a saved room and clears an expired saved session', async () => {
	const service = createFakeOnlineGameService({
		restoreSessionResult: { uid: 'host', roomId: 'AB2C3D' },
	})
	render(OnlineMultiplayerGame, { props: { service } })

	await waitFor(() => {
		expect(service.subscribeToRoom).toHaveBeenCalledWith(
			'AB2C3D',
			expect.any(Function),
			expect.any(Function),
		)
	})

	const onError = vi.mocked(service.subscribeToRoom).mock.calls[0][2]
	onError('CONNECTION_INTERRUPTED')
	await waitFor(() => {
		expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…')
	})

	onError('ROOM_NOT_FOUND')

	expect(service.clearSession).toHaveBeenCalled()
	await waitFor(() => {
		expect(screen.getByRole('alert')).toHaveTextContent(
			'Room not found or expired.',
		)
	})
})

it('shows the online entry and errors in Thai', () => {
	gameStore.setLocale('th')
	gameStore.setOnlineStatus('error', 'ROOM_FULL')
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	expect(screen.getByRole('alert')).toHaveTextContent('ห้องนี้เต็มแล้ว')
	expect(screen.getByLabelText('ชื่อที่แสดง')).toBeInTheDocument()
	expect(screen.getByLabelText('รหัสห้อง')).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'สร้างห้อง' })).toBeDisabled()
})

it('shows the lobby in Thai', () => {
	gameStore.setLocale('th')
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	expect(screen.getByText('ผู้เล่น 2 / 2 คน')).toBeInTheDocument()
	expect(screen.getByText('(เจ้าของห้อง)')).toBeInTheDocument()
	expect(
		screen.getByRole('button', { name: 'คัดลอกรหัสห้อง' }),
	).toBeInTheDocument()
	expect(screen.getByRole('button', { name: 'ออกจากห้อง' })).toBeInTheDocument()
})

function threePlayerGuessing(input: {
	currentGuesserUid: string
	eliminated?: string[]
	left?: string[]
	turnNumber?: number
}): OnlineSnapshot {
	const names: Record<string, string> = { host: 'Ada', p2: 'Lin', p3: 'Mo' }
	return {
		room: {
			id: 'AB2C3D',
			hostUid: 'host',
			phase: 'guessing',
			digitCount: 3,
			maxPlayers: 3,
			playerOrder: ['host', 'p2', 'p3'],
			currentGuesserUid: input.currentGuesserUid,
			winnerUid: null,
			turnNumber: input.turnNumber ?? 0,
			match: 2,
		},
		players: ['host', 'p2', 'p3'].map((uid, seat) => ({
			uid,
			name: names[uid],
			seat,
			ready: true,
			eliminated: (input.eliminated ?? []).includes(uid),
			left: (input.left ?? []).includes(uid),
		})),
		guesses: [],
	}
}

it('drops a target who is eliminated and picks the last one left', async () => {
	const user = userEvent.setup()
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(threePlayerGuessing({ currentGuesserUid: 'host' }))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})
	await user.selectOptions(screen.getByLabelText('Target player'), 'p3')

	gameStore.applyOnlineSnapshot(
		threePlayerGuessing({ currentGuesserUid: 'host', eliminated: ['p3'] }),
	)

	await waitFor(() => {
		expect(screen.getByLabelText('Target player')).toHaveValue('p2')
	})
	expect(screen.queryByRole('option', { name: 'Mo' })).not.toBeInTheDocument()
})

it('blocks a second Create Room while the first is connecting', () => {
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})
	gameStore.setOnlineStatus('connecting')

	return waitFor(() => {
		expect(screen.getByRole('button', { name: 'Create Room' })).toBeDisabled()
		expect(screen.getByRole('button', { name: 'Join Room' })).toBeDisabled()
	})
})

it('asks before forfeiting a match in progress', async () => {
	const user = userEvent.setup()
	const service = createFakeOnlineGameService()
	gameStore.setOnlineIdentity('p2', 'AB2C3D')
	gameStore.applyOnlineSnapshot(threePlayerGuessing({ currentGuesserUid: 'host' }))
	render(OnlineMultiplayerGame, { props: { service } })

	await user.click(screen.getByRole('button', { name: 'Leave game' }))
	expect(screen.getByText('Leave now? You forfeit this match.')).toBeInTheDocument()
	await user.click(screen.getByRole('button', { name: 'Keep playing' }))
	expect(service.leaveRoom).not.toHaveBeenCalled()

	await user.click(screen.getByRole('button', { name: 'Leave game' }))
	await user.click(screen.getByRole('button', { name: 'Forfeit and leave' }))

	expect(service.leaveRoom).toHaveBeenCalledWith('AB2C3D')
})

it('lets an eliminated player leave without a forfeit prompt', async () => {
	const user = userEvent.setup()
	const service = createFakeOnlineGameService()
	gameStore.setOnlineIdentity('p3', 'AB2C3D')
	gameStore.applyOnlineSnapshot(
		threePlayerGuessing({ currentGuesserUid: 'host', eliminated: ['p3'] }),
	)
	render(OnlineMultiplayerGame, { props: { service } })

	await user.click(screen.getByRole('button', { name: 'Leave Room' }))

	expect(service.leaveRoom).toHaveBeenCalledWith('AB2C3D')
})

it('offers to remove a player who has been idle for two minutes', async () => {
	vi.useFakeTimers()
	const service = createFakeOnlineGameService()
	gameStore.setOnlineIdentity('p2', 'AB2C3D')
	gameStore.applyOnlineSnapshot(
		threePlayerGuessing({ currentGuesserUid: 'host', turnNumber: 4 }),
	)
	render(OnlineMultiplayerGame, { props: { service } })
	expect(
		screen.queryByRole('button', { name: 'Remove Ada for inactivity' }),
	).not.toBeInTheDocument()

	await vi.advanceTimersByTimeAsync(119_000)
	expect(
		screen.queryByRole('button', { name: 'Remove Ada for inactivity' }),
	).not.toBeInTheDocument()

	await vi.advanceTimersByTimeAsync(6_000)
	await fireEvent.click(
		screen.getByRole('button', { name: 'Remove Ada for inactivity' }),
	)

	expect(service.removeIdlePlayer).toHaveBeenCalledWith({
		roomId: 'AB2C3D',
		turnNumber: 4,
	})
})

it('never offers idle removal to the player whose turn it is', async () => {
	vi.useFakeTimers()
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(threePlayerGuessing({ currentGuesserUid: 'host' }))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	await vi.advanceTimersByTimeAsync(180_000)

	expect(screen.queryByText(/for inactivity/)).not.toBeInTheDocument()
})

it('labels players who left the match', () => {
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(
		threePlayerGuessing({
			currentGuesserUid: 'host',
			eliminated: ['p3'],
			left: ['p3'],
		}),
	)
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	expect(
		within(screen.getByText('Mo').closest('li') as HTMLElement).getByText('Left'),
	).toBeInTheDocument()
})

it('shows only the current match in the guess history', () => {
	const snapshot = threePlayerGuessing({ currentGuesserUid: 'host' })
	const guess = {
		turnNumber: 1,
		guesserUid: 'host',
		targetUid: 'p2',
		correct: false,
		correctDigits: 0,
		correctPositions: 0,
	}
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot({
		...snapshot,
		guesses: [
			{ ...guess, id: 'old', guess: '111', match: 1 },
			{ ...guess, id: 'new', guess: '222', match: 2 },
		],
	})
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	expect(screen.queryByText(/guessed 111/)).not.toBeInTheDocument()
	expect(screen.getByText(/guessed 222/)).toBeInTheDocument()
})

it('lets the host start once two players are ready', async () => {
	const user = userEvent.setup()
	const service = createFakeOnlineGameService()
	const lobby = readyLobbySnapshot(true)
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot({
		...lobby,
		room: { ...lobby.room, maxPlayers: 3, playerOrder: ['host', 'p2', 'p3'] },
		players: [
			...lobby.players,
			{ uid: 'p3', name: 'Mo', seat: 2, ready: false, eliminated: false },
		],
	})
	render(OnlineMultiplayerGame, { props: { service } })

	expect(
		screen.getByText("Players who aren't ready yet will be left out."),
	).toBeInTheDocument()
	await user.click(screen.getByRole('button', { name: 'Start Game' }))

	expect(service.startRoom).toHaveBeenCalledWith('AB2C3D')
})

it('forgets the invite link once the player has joined', async () => {
	const user = userEvent.setup()
	window.history.replaceState({}, '', '/?room=AB2C3D')
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService(), initialRoomId: 'AB2C3D' },
	})

	await user.type(screen.getByLabelText('Display name'), 'Lin')
	await user.click(screen.getByRole('button', { name: 'Join Room' }))

	await waitFor(() => {
		expect(window.location.search).toBe('')
	})
})

it('reports a failed reconnect instead of waiting forever', async () => {
	const service = createFakeOnlineGameService()
	vi.mocked(service.restoreSession).mockRejectedValue(
		new Error('CONNECTION_INTERRUPTED'),
	)
	render(OnlineMultiplayerGame, { props: { service } })

	await waitFor(() => {
		expect(screen.getByRole('alert')).toHaveTextContent(
			'Could not restore the room.',
		)
	})
	expect(screen.getByRole('status')).not.toHaveTextContent('Reconnecting…')
})

it('waits for the host to be ready before starting', () => {
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(readyLobbySnapshot(false))
	render(OnlineMultiplayerGame, {
		props: { service: createFakeOnlineGameService() },
	})

	expect(screen.getByRole('button', { name: 'Start Game' })).toBeDisabled()
})

it('moves focus to the error when a command fails', async () => {
	const user = userEvent.setup()
	const service = createFakeOnlineGameService()
	vi.mocked(service.createRoom).mockRejectedValue(new Error('ONLINE_UNAVAILABLE'))
	render(OnlineMultiplayerGame, { props: { service } })

	await user.type(screen.getByLabelText('Display name'), 'Ada')
	await user.click(screen.getByRole('button', { name: 'Create Room' }))

	const alert = screen.getByRole('alert')
	await waitFor(() => {
		expect(alert).toHaveTextContent(
			"Online play isn't available right now. Try Single Player or Local Multiplayer.",
		)
		expect(alert).toHaveFocus()
	})
	expect(screen.getByRole('button', { name: 'Create Room' })).toBeEnabled()
})

it('reports a lost connection on a command as an error to retry, not as reconnecting', async () => {
	const user = userEvent.setup()
	const service = createFakeOnlineGameService()
	vi.mocked(service.joinRoom).mockRejectedValue(new Error('CONNECTION_INTERRUPTED'))
	render(OnlineMultiplayerGame, {
		props: { service, initialRoomId: 'AB2C3D' },
	})

	await user.type(screen.getByLabelText('Display name'), 'Lin')
	await user.click(screen.getByRole('button', { name: 'Join Room' }))

	await waitFor(() => {
		expect(screen.getByRole('alert')).toHaveTextContent(
			"Couldn't reach the game server. Check your connection and try again.",
		)
	})
	expect(screen.getByRole('alert')).toHaveFocus()
	expect(screen.getByRole('status')).not.toHaveTextContent('Reconnecting…')
})

it('keeps focus on the error when a guess is rejected', async () => {
	const user = userEvent.setup()
	const service = createFakeOnlineGameService()
	vi.mocked(service.submitGuess).mockRejectedValue(new Error('TURN_STALE'))
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(guessingSnapshot({ currentGuesserUid: 'host' }))
	render(OnlineMultiplayerGame, { props: { service } })

	await user.type(screen.getByLabelText('Guess'), '456{Enter}')

	await waitFor(() => {
		expect(screen.getByRole('alert')).toHaveTextContent(
			'The turn changed. Try again.',
		)
	})
	expect(screen.getByRole('alert')).toHaveFocus()
})

it('reports an unanswered command inside a room as a lost connection', async () => {
	const user = userEvent.setup()
	const service = createFakeOnlineGameService()
	vi.mocked(service.submitGuess).mockRejectedValue(new Error('ONLINE_UNAVAILABLE'))
	gameStore.setOnlineIdentity('host', 'AB2C3D')
	gameStore.applyOnlineSnapshot(guessingSnapshot({ currentGuesserUid: 'host' }))
	render(OnlineMultiplayerGame, { props: { service } })

	await user.type(screen.getByLabelText('Guess'), '456{Enter}')

	await waitFor(() => {
		expect(screen.getByRole('alert')).toHaveTextContent(
			"Couldn't reach the game server. Check your connection and try again.",
		)
	})
	expect(screen.getByRole('alert')).toHaveFocus()
})

it('moves focus to the error in Thai too', async () => {
	const user = userEvent.setup()
	gameStore.setLocale('th')
	const service = createFakeOnlineGameService()
	vi.mocked(service.createRoom).mockRejectedValue(new Error('ONLINE_UNAVAILABLE'))
	render(OnlineMultiplayerGame, { props: { service } })

	await user.type(screen.getByLabelText('ชื่อที่แสดง'), 'อลิซ')
	await user.click(screen.getByRole('button', { name: 'สร้างห้อง' }))

	await waitFor(() => {
		expect(screen.getByRole('alert')).toHaveTextContent(
			'ตอนนี้ยังเล่นออนไลน์ไม่ได้ ลองเล่นคนเดียวหรือเล่นหลายคนในเครื่องเดียวก่อนนะ',
		)
	})
	expect(screen.getByRole('alert')).toHaveFocus()
})

describe('a saved room that cannot be restored', () => {
	function failingRestore() {
		const service = createFakeOnlineGameService()
		vi.mocked(service.restoreSession).mockRejectedValue(
			new Error('ONLINE_GAME_INTERNAL'),
		)
		return service
	}

	it('offers to try again or forget the room instead of the entry form', async () => {
		render(OnlineMultiplayerGame, { props: { service: failingRestore() } })

		expect(
			await screen.findByRole('heading', { name: 'Your saved room' }),
		).toBeInTheDocument()
		expect(screen.getByRole('alert')).toHaveTextContent(
			'Could not restore the room.',
		)
		expect(
			screen.getByText('Try again, or forget this room to create or join another one.'),
		).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
		expect(screen.getByRole('button', { name: 'Forget this room' })).toBeEnabled()
		expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument()
	})

	it('retries the restore and keeps focus on a repeated failure', async () => {
		const user = userEvent.setup()
		const service = failingRestore()
		render(OnlineMultiplayerGame, { props: { service } })

		await user.click(await screen.findByRole('button', { name: 'Try again' }))

		expect(service.restoreSession).toHaveBeenCalledTimes(2)
		await waitFor(() => {
			expect(screen.getByRole('alert')).toHaveTextContent(
				'Could not restore the room.',
			)
			expect(screen.getByRole('alert')).toHaveFocus()
		})

		vi.mocked(service.restoreSession).mockResolvedValue({
			uid: 'host',
			roomId: 'AB2C3D',
		})
		await user.click(screen.getByRole('button', { name: 'Try again' }))

		await waitFor(() => {
			expect(service.subscribeToRoom).toHaveBeenCalledWith(
				'AB2C3D',
				expect.any(Function),
				expect.any(Function),
			)
		})
		expect(
			screen.queryByRole('button', { name: 'Forget this room' }),
		).not.toBeInTheDocument()
		expect(screen.getByRole('alert').textContent?.trim()).toBe('')
	})

	it('returns to a usable entry form when the retry finds no saved room', async () => {
		const user = userEvent.setup()
		const service = failingRestore()
		render(OnlineMultiplayerGame, { props: { service } })
		await screen.findByRole('button', { name: 'Try again' })
		vi.mocked(service.restoreSession).mockResolvedValue(null)

		await user.click(screen.getByRole('button', { name: 'Try again' }))
		await user.type(await screen.findByLabelText('Display name'), 'Ada')

		expect(screen.getByRole('button', { name: 'Create Room' })).toBeEnabled()
		expect(
			screen.getByText('Create a room or enter the ID from another player.'),
		).toBeInTheDocument()
	})

	it('forgets the room and shows the entry form with focus on its heading', async () => {
		const user = userEvent.setup()
		const service = failingRestore()
		render(OnlineMultiplayerGame, { props: { service } })

		await user.click(
			await screen.findByRole('button', { name: 'Forget this room' }),
		)

		expect(service.clearSession).toHaveBeenCalled()
		expect(screen.getByLabelText('Display name')).toBeInTheDocument()
		expect(screen.getByRole('alert').textContent?.trim()).toBe('')
		await waitFor(() => {
			expect(
				screen.getByRole('heading', { name: 'Play with friends.' }),
			).toHaveFocus()
		})
	})

	it('offers the same choice in Thai', async () => {
		gameStore.setLocale('th')
		render(OnlineMultiplayerGame, { props: { service: failingRestore() } })

		expect(
			await screen.findByRole('heading', { name: 'ห้องที่บันทึกไว้' }),
		).toBeInTheDocument()
		expect(screen.getByRole('alert')).toHaveTextContent('กู้คืนห้องไม่สำเร็จ')
		expect(screen.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'ลืมห้องนี้' })).toBeInTheDocument()
	})
})
