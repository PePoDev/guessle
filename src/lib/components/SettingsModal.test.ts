import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { get } from 'svelte/store'
import SettingsModal from './SettingsModal.svelte'
import { gameStore, type GameMode } from '$lib/stores/gameStore'

describe('SettingsModal Component', () => {
	const mockOnClose = vi.fn()

	function renderSettings(mode: GameMode = 'random') {
		gameStore.setMode(mode)
		return render(SettingsModal, {
			props: { mode, onclose: mockOnClose },
		})
	}

	beforeEach(() => {
		mockOnClose.mockClear()
		gameStore.reset()
		localStorage.clear()
	})

	afterEach(() => {
		localStorage.clear()
	})

	it('switches the language and saves the choice', async () => {
		const user = userEvent.setup()
		renderSettings('random')

		await user.selectOptions(screen.getByLabelText('Language:'), 'th')

		expect(get(gameStore).locale).toBe('th')
		expect(localStorage.getItem('number-guessing-locale')).toBe('th')
		expect(
			screen.getByRole('heading', { name: 'ตั้งค่าโหมดสุ่มเลข' }),
		).toBeInTheDocument()
		expect(screen.getByLabelText('ภาษา:')).toHaveValue('th')
	})

	it('writes each language option in its own language', () => {
		renderSettings('random')

		expect(screen.getByRole('option', { name: 'English' })).toHaveAttribute(
			'lang',
			'en',
		)
		expect(screen.getByRole('option', { name: 'ภาษาไทย' })).toHaveAttribute(
			'lang',
			'th',
		)
	})

	it.each(['random', 'multi'] as const)(
		'warns that changing %s options starts a new game',
		(mode) => {
			renderSettings(mode)

			expect(
				screen.getByText('Changing these options starts a new game.'),
			).toBeInTheDocument()
		},
	)

	it('says online options apply to the next room instead of restarting', () => {
		renderSettings('online')

		expect(
			screen.getByText('These options apply to the next room you create.'),
		).toBeInTheDocument()
		expect(
			screen.queryByText('Changing these options starts a new game.'),
		).not.toBeInTheDocument()
	})

	it('explains online options in Thai', () => {
		gameStore.setLocale('th')

		renderSettings('online')

		expect(
			screen.getByText('ตัวเลือกเหล่านี้จะใช้กับห้องถัดไปที่คุณสร้าง'),
		).toBeInTheDocument()
		expect(
			screen.queryByText('การเปลี่ยนตัวเลือกเหล่านี้จะเริ่มเกมใหม่'),
		).not.toBeInTheDocument()
	})

	it('offers only the language and sound once an online room starts', () => {
		gameStore.setMode('online')
		gameStore.applyOnlineSnapshot({
			room: {
				id: 'AB2C3D',
				hostUid: 'host',
				phase: 'lobby',
				digitCount: 3,
				maxPlayers: 2,
				playerOrder: ['host'],
				currentGuesserUid: null,
				winnerUid: null,
				turnNumber: 0,
			},
			players: [],
			guesses: [],
		})

		renderSettings('online')

		expect(screen.getByLabelText('Language:')).toHaveValue('en')
		expect(screen.getByLabelText('Sound effects:')).toHaveValue('on')
		expect(
			screen.queryByText('Changing these options starts a new game.'),
		).not.toBeInTheDocument()
		expect(
			screen.queryByText('These options apply to the next room you create.'),
		).not.toBeInTheDocument()
		expect(screen.queryByLabelText('Number of Digits:')).not.toBeInTheDocument()
		expect(
			screen.queryByLabelText('Number of Players:'),
		).not.toBeInTheDocument()
	})

	it('shows Thai titles, labels, and options', () => {
		gameStore.setLocale('th')

		renderSettings('random')

		expect(
			screen.getByRole('heading', { name: 'ตั้งค่าโหมดสุ่มเลข' }),
		).toBeInTheDocument()
		expect(screen.getByLabelText('จำนวนหลัก:')).toHaveDisplayValue('3 หลัก')
		expect(screen.getByLabelText('จำนวนครั้งที่ทายได้:')).toHaveDisplayValue(
			'7 ครั้ง',
		)
		expect(screen.getByLabelText('เสียงประกอบ:')).toHaveDisplayValue('เปิด')
		expect(screen.getByRole('option', { name: 'ปิด' })).toHaveValue('off')
		expect(
			screen.getByRole('button', { name: 'ปิดการตั้งค่า' }),
		).toBeInTheDocument()
	})

	it.each([
		['daily', 'Daily Guessle Settings'],
		['random', 'Random Settings'],
		['multi', 'Local Multiplayer Settings'],
		['online', 'Online Multiplayer Settings'],
	] as const)('shows the %s mode title', (mode, title) => {
		renderSettings(mode)

		expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
	})

	it('does not offer a game mode selector', () => {
		renderSettings()

		expect(screen.queryByLabelText('Game Mode:')).not.toBeInTheDocument()
	})

	it('shows digits and attempts, but not players, in Random', () => {
		renderSettings('random')

		expect(screen.getByLabelText('Number of Digits:')).toBeInTheDocument()
		expect(screen.getByLabelText('Max Attempts:')).toBeInTheDocument()
		expect(
			screen.queryByLabelText('Number of Players:'),
		).not.toBeInTheDocument()
	})

	it('offers only the language and sound in Guessle', () => {
		renderSettings('daily')

		expect(screen.getByLabelText('Language:')).toBeInTheDocument()
		expect(screen.getByLabelText('Sound effects:')).toBeInTheDocument()
		expect(screen.queryByLabelText('Number of Digits:')).not.toBeInTheDocument()
		expect(screen.queryByLabelText('Max Attempts:')).not.toBeInTheDocument()
		expect(
			screen.queryByLabelText('Number of Players:'),
		).not.toBeInTheDocument()
		expect(
			screen.queryByText('Changing these options starts a new game.'),
		).not.toBeInTheDocument()
	})

	it.each(['multi', 'online'] as const)(
		'shows only multiplayer settings for %s mode',
		(mode) => {
			renderSettings(mode)

			expect(screen.getByLabelText('Number of Digits:')).toBeInTheDocument()
			expect(screen.getByLabelText('Number of Players:')).toBeInTheDocument()
			expect(screen.queryByLabelText('Max Attempts:')).not.toBeInTheDocument()
		},
	)

	it('offers all supported digit and attempt values', () => {
		renderSettings()
		const digits = screen.getByLabelText(
			'Number of Digits:',
		) as HTMLSelectElement
		const attempts = screen.getByLabelText(
			'Max Attempts:',
		) as HTMLSelectElement

		expect(Array.from(digits.options, (option) => option.text)).toEqual([
			'2 digits',
			'3 digits',
			'4 digits',
			'5 digits',
		])
		expect(Array.from(attempts.options, (option) => option.text)).toEqual([
			'3 attempts',
			'5 attempts',
			'7 attempts',
			'10 attempts',
			'15 attempts',
			'20 attempts',
		])
	})

	it('offers two to four multiplayer players', () => {
		renderSettings('multi')
		const players = screen.getByLabelText(
			'Number of Players:',
		) as HTMLSelectElement

		expect(Array.from(players.options, (option) => option.text)).toEqual([
			'2 players',
			'3 players',
			'4 players',
		])
	})

	it('starts a new Random game with the chosen settings', async () => {
		const user = userEvent.setup()
		renderSettings('random')
		gameStore.startNewGame()

		await user.selectOptions(screen.getByLabelText('Number of Digits:'), '4')

		expect(get(gameStore).targetNumber).toHaveLength(4)
		expect(get(gameStore).attemptsLeft).toBe(7)

		await user.selectOptions(screen.getByLabelText('Max Attempts:'), '3')

		expect(get(gameStore).attemptsLeft).toBe(3)
	})

	it.each(['daily', 'random', 'multi', 'online'] as const)(
		'turns sound effects off and on in %s mode and saves the choice',
		async (mode) => {
			const user = userEvent.setup()
			renderSettings(mode)
			const sound = screen.getByLabelText('Sound effects:') as HTMLSelectElement

			expect(Array.from(sound.options, (option) => option.text)).toEqual([
				'On',
				'Off',
			])
			expect(sound).toHaveValue('on')

			await user.selectOptions(sound, 'Off')

			expect(get(gameStore).sound).toBe(false)
			expect(localStorage.getItem('number-guessing-sound')).toBe('off')
			expect(sound).toHaveValue('off')

			await user.selectOptions(sound, 'On')

			expect(get(gameStore).sound).toBe(true)
			expect(localStorage.getItem('number-guessing-sound')).toBe('on')
		},
	)

	it('shows sound effects as off when they are off', () => {
		gameStore.setSound(false)

		renderSettings('random')

		expect(screen.getByLabelText('Sound effects:')).toHaveDisplayValue('Off')
	})

	it('reflects and updates current settings', async () => {
		gameStore.updateSettings({ digitCount: 4, maxAttempts: 10 })
		const user = userEvent.setup()
		renderSettings()
		const digits = screen.getByLabelText('Number of Digits:')
		const attempts = screen.getByLabelText('Max Attempts:')

		expect(digits).toHaveValue('4')
		expect(attempts).toHaveValue('10')
		await user.selectOptions(digits, '5')
		await user.selectOptions(attempts, '15')

		await waitFor(() => {
			expect(get(gameStore).settings).toMatchObject({
				digitCount: 5,
				maxAttempts: 15,
			})
		})
	})

	it('updates multiplayer player count', async () => {
		const user = userEvent.setup()
		renderSettings('multi')

		await user.selectOptions(screen.getByLabelText('Number of Players:'), '3')

		expect(get(gameStore).settings.playerCount).toBe(3)
	})

	it.each([
		['Close settings', 'button'],
		['Close', 'text'],
	] as const)('closes from the %s control', async (name, query) => {
		const user = userEvent.setup()
		renderSettings()
		const button =
			query === 'button'
				? screen.getByRole('button', { name })
				: screen.getByText(name)

		await user.click(button)

		expect(mockOnClose).toHaveBeenCalledTimes(1)
	})

	it('closes from the backdrop and Escape, but not modal content', async () => {
		const user = userEvent.setup()
		renderSettings()
		const dialog = screen.getByRole('dialog')

		await user.click(screen.getByRole('heading'))
		expect(mockOnClose).not.toHaveBeenCalled()
		await user.click(dialog)
		expect(mockOnClose).toHaveBeenCalledTimes(1)
		await user.keyboard('{Escape}')
		expect(mockOnClose).toHaveBeenCalledTimes(2)
	})

	it('traps focus within the modal', async () => {
		const user = userEvent.setup()
		renderSettings()
		const focusables = screen
			.getByRole('dialog')
			.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
			)
		const last = focusables[focusables.length - 1]

		last.focus()
		await user.tab()
		expect(focusables[0]).toHaveFocus()
		focusables[0].focus()
		await user.tab({ shift: true })
		expect(last).toHaveFocus()
	})

	it('keeps focus inside when the backdrop itself has focus', async () => {
		const user = userEvent.setup()
		renderSettings()
		const dialog = screen.getByRole('dialog')
		const focusables = dialog.querySelectorAll<HTMLElement>(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
		)

		dialog.focus()
		await user.tab({ shift: true })

		expect(focusables[focusables.length - 1]).toHaveFocus()
	})

	it('restores focus when unmounted', () => {
		const trigger = document.createElement('button')
		document.body.appendChild(trigger)
		trigger.focus()
		const { unmount } = renderSettings()

		unmount()

		expect(trigger).toHaveFocus()
		trigger.remove()
	})

	it('keeps the modal dialog styling and accessibility attributes', () => {
		renderSettings()
		const dialog = screen.getByRole('dialog')

		expect(dialog).toHaveAttribute('aria-modal', 'true')
		expect(dialog).toHaveClass('backdrop-blur-md')
		expect(
			dialog.querySelector('.animate-modal-slide-in'),
		).toBeInTheDocument()
	})
})
