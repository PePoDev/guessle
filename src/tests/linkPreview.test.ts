import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { messages } from '$lib/i18n/messages'

const SITE = 'https://guessle.pepo.dev/'

// Crawlers read the static page and never run the app, so these tests read src/app.html itself.
const head = new DOMParser().parseFromString(
	readFileSync(resolve(process.cwd(), 'src', 'app.html'), 'utf8'),
	'text/html',
).head

function content(selector: string) {
	return head.querySelector(selector)?.getAttribute('content') ?? ''
}

function href(selector: string) {
	return head.querySelector(selector)?.getAttribute('href') ?? ''
}

function staticFile(path: string) {
	return resolve(process.cwd(), 'static', path.replace(/^\//, ''))
}

function pngSize(path: string) {
	const png = readFileSync(path)
	expect(png.subarray(1, 4).toString()).toBe('PNG')
	return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

describe('link previews', () => {
	it('gives crawlers a title and a description without running the app', () => {
		expect(head.querySelectorAll('title')).toHaveLength(1)
		expect(head.querySelector('title')?.textContent).toBe(messages.en.title)
		expect(content('meta[name="description"]')).toMatch(/3-digit number puzzle/)
		expect(href('link[rel="canonical"]')).toBe(SITE)
	})

	it('describes the page with Open Graph tags and a large X card', () => {
		expect(content('meta[property="og:type"]')).toBe('website')
		expect(content('meta[property="og:site_name"]')).toBe('Guessle')
		expect(content('meta[property="og:url"]')).toBe(SITE)
		expect(content('meta[property="og:title"]')).toBe(messages.en.title)
		const description = content('meta[property="og:description"]')
		expect(description).toContain("Guess today's 3-digit number in 6 tries.")
		expect(description).toContain('ทายเลข 3 หลักของวันนี้ให้ถูกภายใน 6 ครั้ง')
		expect(content('meta[name="twitter:card"]')).toBe('summary_large_image')
	})

	it('points the share image at an absolute HTTPS URL of a light 1200 × 630 PNG', () => {
		const image = content('meta[property="og:image"]')
		expect(image).toBe(`${SITE}og-image.png`)
		expect(content('meta[property="og:image:type"]')).toBe('image/png')
		expect(content('meta[property="og:image:width"]')).toBe('1200')
		expect(content('meta[property="og:image:height"]')).toBe('630')
		expect(content('meta[property="og:image:alt"]')).toMatch(/Guessle/)

		const file = staticFile(new URL(image).pathname)
		expect(pngSize(file)).toEqual({ width: 1200, height: 630 })
		// WhatsApp documents a 600 KB limit; staying well under it keeps every app fetching the image.
		expect(statSync(file).size).toBeLessThan(300 * 1024)
	})

	it('ships Guessle icons in place of the Svelte logo', () => {
		const svg = readFileSync(staticFile(href('link[rel="icon"][type="image/svg+xml"]')), 'utf8')
		expect(svg).toContain('<svg')
		expect(svg).not.toMatch(/svelte/i)

		expect(pngSize(staticFile(href('link[rel="apple-touch-icon"]')))).toEqual({ width: 180, height: 180 })

		const ico = readFileSync(staticFile(href('link[rel="icon"][sizes="32x32"]')))
		expect(ico.readUInt16LE(2)).toBe(1)
		const sizes = Array.from({ length: ico.readUInt16LE(4) }, (_, index) => ico.readUInt8(6 + 16 * index))
		expect(sizes).toEqual([16, 32])
	})

	it('draws the SVG icon in the current ink and accent tokens', () => {
		// The SVG cannot read app.css, so it repeats these two tokens as hex values.
		const css = readFileSync(resolve(process.cwd(), 'src', 'app.css'), 'utf8')
		const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1].toLowerCase()
		const svg = readFileSync(staticFile('favicon.svg'), 'utf8')
		const fills = [...svg.matchAll(/fill="(#[0-9a-f]{6})"/gi)].map(([, color]) => color.toLowerCase())

		expect(fills).toEqual([token('stage-border'), token('glass-accent')])
	})
})
