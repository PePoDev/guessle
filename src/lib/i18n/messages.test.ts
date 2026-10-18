import { describe, expect, it } from 'vitest'
import { messages } from './messages'

function shape(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(shape)
	}
	if (typeof value === 'function') {
		return `function/${value.length}`
	}
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, shape(entry)]),
		)
	}
	return typeof value
}

function leaves(value: unknown, path = ''): Array<[string, string]> {
	if (typeof value === 'function') {
		const render = value as (...args: number[]) => unknown
		return [[path, JSON.stringify(render(1, 2, 3, 4))]]
	}
	if (typeof value === 'string') {
		return [[path, value]]
	}
	if (value && typeof value === 'object') {
		return Object.entries(value).flatMap(([key, entry]) =>
			leaves(entry, `${path}.${key}`),
		)
	}
	return []
}

describe('messages', () => {
	it('gives Thai the same entries as English', () => {
		expect(shape(messages.th)).toEqual(shape(messages.en))
	})

	it('translates every Thai entry instead of copying English', () => {
		const thai = new Map(leaves(messages.th))
		// The Guessle name, its wordmark, and its share heading read the same in every language.
		const names = ['.header.title', '.header.titleSignature', '.daily.heading', '.daily.shareTitle']
		const untranslated = leaves(messages.en)
			.filter(([path, english]) => thai.get(path) === english && !names.includes(path))
			.map(([path]) => path)

		expect(untranslated).toEqual([])
	})

	it('pluralizes English counts and keeps Thai counts invariant', () => {
		expect(messages.en.random.solved(1)).toBe('Got it in one!')
		expect(messages.en.random.solved(3)).toBe('Solved in 3 tries!')
		expect(messages.th.random.solved(3)).toBe('ทายถูกใน 3 ครั้ง!')
		expect(messages.en.random.triesLeft(1)).toBe('1 try left')
		expect(messages.en.random.triesLeft(7)).toBe('7 tries left')
		expect(messages.th.random.triesLeft(1)).toBe('เหลือ 1 ครั้ง')
	})

	it('describes a Random row with both hints in both languages', () => {
		expect(messages.en.random.row(1, '1 2 3', 2, 1)).toBe(
			'Guess 1: 1 2 3, 2 in the number, 1 in the right spot',
		)
		expect(messages.th.random.row(1, '1 2 3', 2, 1)).toBe(
			'ครั้งที่ 1: 1 2 3 มีในคำตอบ 2 ตัว ถูกตำแหน่ง 1 ตัว',
		)
	})

	it('shares the board copy between Guessle and Random', () => {
		expect(messages.en.board.short(3)).toBe('Enter all 3 digits.')
		expect(messages.en.board.duplicate('123')).toBe("You've already tried 123.")
		expect(messages.en.board.entry('')).toBe('Current guess is empty')
		expect(messages.th.board.short(3)).toBe('กรอกให้ครบ 3 หลัก')
	})

	it('names Random and sound effects in both languages', () => {
		expect(messages.en.modes.random).toBe('Random')
		expect(messages.en.header.random).toBe('Random')
		expect(messages.en.settings.titles.random).toBe('Random Settings')
		expect(messages.en.settings.sound).toBe('Sound effects:')
		expect(messages.th.modes.random).toBe('สุ่มเลข')
		expect(messages.th.settings.sound).toBe('เสียงประกอบ:')
	})

	it('introduces multiplayer with the players picking the secret numbers', () => {
		for (const locale of ['en', 'th'] as const) {
			const { localIntro, onlineIntro } = messages[locale].header
			expect(localIntro(4)).toContainEqual({ value: 4 })
			expect(onlineIntro(4)).toContainEqual({ value: 4 })
		}
		expect(messages.en.instructions.friendsSteps.join(' ')).not.toMatch(/everyone is ready/)
	})

	it('never tells a player that a failed command is reconnecting by itself', () => {
		expect(messages.en.online.errors.CONNECTION_INTERRUPTED).not.toMatch(/Reconnecting/)
		expect(messages.th.online.errors.CONNECTION_INTERRUPTED).not.toMatch(/กำลังเชื่อมต่อใหม่/)
	})

	it('describes guess problems in both languages', () => {
		expect(messages.en.validation.range(3)).toBe(
			'Please enter a number between 000 and 999.',
		)
		expect(messages.th.validation.length(4)).toBe(
			'กรุณากรอกตัวเลขให้ครบ 4 หลัก',
		)
	})
})
