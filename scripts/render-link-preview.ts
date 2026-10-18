// Renders the link-preview image and site icons into static/ from the pages in
// scripts/link-preview/. The pages link src/app.css, so they draw with the app's
// color tokens; re-run `pnpm link-preview` after changing a page, a token, or
// static/favicon.svg.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium, type Page } from '@playwright/test'

const root = resolve(import.meta.dirname, '..')
const source = (name: string) => pathToFileURL(resolve(root, 'scripts/link-preview', name)).href
const target = (name: string) => resolve(root, 'static', name)

// Fonts that fail to load would fall back silently, so a missing one stops the render instead.
async function capture(page: Page, url: string, width: number, height: number, fonts: string[] = []) {
	await page.setViewportSize({ width, height })
	await page.goto(url, { waitUntil: 'networkidle' })
	const missing = await page.evaluate(async (fonts) => {
		const loaded = await Promise.all(fonts.map((font) => document.fonts.load(font, 'Gก')))
		return fonts.filter((_, index) => loaded[index].length === 0)
	}, fonts)
	if (missing.length) {
		throw new Error(`${url} could not load ${missing.join(', ')}`)
	}
	return page.screenshot()
}

// An .ico holding PNG images, which every current browser reads.
function ico(images: { size: number; png: Buffer }[]) {
	const header = Buffer.alloc(6 + 16 * images.length)
	header.writeUInt16LE(1, 2)
	header.writeUInt16LE(images.length, 4)
	let offset = header.length
	images.forEach(({ size, png }, index) => {
		const entry = 6 + 16 * index
		header.writeUInt8(size, entry)
		header.writeUInt8(size, entry + 1)
		header.writeUInt16LE(1, entry + 4)
		header.writeUInt16LE(32, entry + 6)
		header.writeUInt32LE(png.length, entry + 8)
		header.writeUInt32LE(offset, entry + 12)
		offset += png.length
	})
	return Buffer.concat([header, ...images.map(({ png }) => png)])
}

const browser = await chromium.launch(
	process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {},
)
const page = await browser.newPage({ deviceScaleFactor: 1 })

writeFileSync(
	target('og-image.png'),
	await capture(page, source('og-image.html'), 1200, 630, ['700 1em "Space Grotesk"', '600 1em Inter', '500 1em "Noto Sans Thai"']),
)
writeFileSync(target('apple-touch-icon.png'), await capture(page, source('apple-touch-icon.html'), 180, 180))

const favicon = `data:image/svg+xml;base64,${readFileSync(target('favicon.svg')).toString('base64')}`
const pngs = []
for (const size of [16, 32]) {
	await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="${favicon}" width="${size}" height="${size}">`)
	await page.setViewportSize({ width: size, height: size })
	pngs.push({ size, png: await page.screenshot({ omitBackground: true }) })
}
writeFileSync(target('favicon.ico'), ico(pngs))

await browser.close()
