import { beforeEach, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/svelte'
import ErrorScreen from './ErrorScreen.svelte'
import { gameStore } from '$lib/stores/gameStore'

beforeEach(() => {
	gameStore.reset()
})

it('says the page was not found and links back to the game', async () => {
	render(ErrorScreen, { props: { status: 404 } })

	expect(
		screen.getByRole('heading', { level: 1, name: 'Page not found' }),
	).toBeInTheDocument()
	expect(
		screen.getByText(
			"There's nothing at this address. Head back to the game to keep playing.",
		),
	).toBeInTheDocument()
	expect(screen.getByRole('link', { name: 'Back to the game' })).toHaveAttribute(
		'href',
		'/',
	)
	expect(screen.getByRole('main')).toHaveClass('panel')
	await waitFor(() => {
		expect(document.title).toBe('Page not found · Guessle')
	})
})

it('reports any other failure as a generic error', () => {
	render(ErrorScreen, { props: { status: 500 } })

	expect(
		screen.getByRole('heading', { level: 1, name: 'Something went wrong' }),
	).toBeInTheDocument()
	expect(
		screen.queryByRole('heading', { name: 'Page not found' }),
	).not.toBeInTheDocument()
	expect(screen.getByRole('link', { name: 'Back to the game' })).toHaveAttribute(
		'href',
		'/',
	)
})

it('shows the not-found screen in Thai', async () => {
	gameStore.setLocale('th')
	render(ErrorScreen, { props: { status: 404 } })

	expect(
		screen.getByRole('heading', { level: 1, name: 'ไม่พบหน้านี้' }),
	).toBeInTheDocument()
	expect(screen.getByRole('link', { name: 'กลับไปที่เกม' })).toHaveAttribute(
		'href',
		'/',
	)
	await waitFor(() => {
		expect(document.title).toBe('ไม่พบหน้านี้ · Guessle')
	})
})
