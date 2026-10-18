import { describe, expect, it, vi } from 'vitest'
import type { RequestEvent, ResolveOptions } from '@sveltejs/kit'
import { handle, optOutOfRocketLoader } from './hooks.server'

describe('optOutOfRocketLoader', () => {
	it('marks every script, inline or external, for Rocket Loader to skip', () => {
		const html = [
			'<link rel="modulepreload" href="/_app/start.js">',
			'<script type="module" src="/_app/entry.js"></script>',
			'<script>',
			'\t{ const element = document.currentScript.parentElement',
			'\t  Promise.all([import("/_app/start.js")]) }',
			'</script>',
			'<SCRIPT src="/legacy.js"></SCRIPT>',
		].join('\n')

		expect(optOutOfRocketLoader(html)).toBe(
			[
				'<link rel="modulepreload" href="/_app/start.js">',
				'<script data-cfasync="false" type="module" src="/_app/entry.js"></script>',
				'<script data-cfasync="false">',
				'\t{ const element = document.currentScript.parentElement',
				'\t  Promise.all([import("/_app/start.js")]) }',
				'</script>',
				'<script data-cfasync="false" src="/legacy.js"></SCRIPT>',
			].join('\n'),
		)
	})

	it('never adds the attribute twice', () => {
		const html =
			'<script data-cfasync="false" src="/a.js"></script><script src="/b.js" data-cfasync="false"></script>'

		expect(optOutOfRocketLoader(html)).toBe(html)
		expect(optOutOfRocketLoader(optOutOfRocketLoader('<script src="/c.js"></script>'))).toBe(
			'<script data-cfasync="false" src="/c.js"></script>',
		)
	})

	it('leaves pages without scripts and look-alike tags unchanged', () => {
		const html = '<noscript>Enable JavaScript</noscript><scripts-list></scripts-list>'

		expect(optOutOfRocketLoader(html)).toBe(html)
	})
})

describe('handle', () => {
	it('applies the opt-out to every page chunk SvelteKit renders', async () => {
		const response = new Response('ok')
		const resolve = vi.fn(
			async (_event: RequestEvent, options?: ResolveOptions) => response,
		)

		await expect(
			handle({ event: {} as RequestEvent, resolve }),
		).resolves.toBe(response)

		const transform = resolve.mock.calls[0][1]?.transformPageChunk
		expect(
			await transform?.({ html: '<script src="/app.js"></script>', done: true }),
		).toBe('<script data-cfasync="false" src="/app.js"></script>')
	})
})
