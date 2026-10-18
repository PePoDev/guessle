import type { Handle } from '@sveltejs/kit'

const scriptWithoutOptOut = /<script\b(?![^>]*\bdata-cfasync\s*=)/gi

// Cloudflare's Rocket Loader rewrites <script> tags to defer them, which can
// change how this client-only app starts. It leaves scripts marked
// data-cfasync="false" alone, including SvelteKit's inline bootstrap module.
export function optOutOfRocketLoader(html: string): string {
	return html.replace(scriptWithoutOptOut, '<script data-cfasync="false"')
}

export const handle: Handle = ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) => optOutOfRocketLoader(html),
	})
