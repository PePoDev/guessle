import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const firebaseConfigNames = [
	'PUBLIC_FIREBASE_API_KEY',
	'PUBLIC_FIREBASE_AUTH_DOMAIN',
	'PUBLIC_FIREBASE_PROJECT_ID',
	'PUBLIC_FIREBASE_STORAGE_BUCKET',
	'PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
	'PUBLIC_FIREBASE_APP_ID',
]

function readWorkflow(name: string): string {
	return readFileSync(
		resolve(process.cwd(), '.github', 'workflows', name),
		'utf8',
	)
}

function section(text: string, start: string, end?: string): string {
	const from = text.indexOf(start)
	expect(from).toBeGreaterThan(-1)
	if (end === undefined) {
		return text.slice(from)
	}
	const to = text.indexOf(end, from + start.length)
	expect(to).toBeGreaterThan(from)
	return text.slice(from, to)
}

describe('deployment workflows', () => {
	// The dev server renders unknown paths itself, so only the build config
	// proves GitHub Pages gets a 404.html to serve.
	it('builds a 404.html fallback for unknown paths', () => {
		const config = readFileSync(resolve(process.cwd(), 'svelte.config.js'), 'utf8')

		expect(config).toMatch(/fallback:\s*["']404\.html["']/)
	})

	it('builds the Pages client from validated Firebase secrets', () => {
		const workflow = readWorkflow('deploy.yml')

		for (const name of firebaseConfigNames) {
			expect(workflow).toContain(`${name}: \${{ secrets.${name} }}`)
		}
		expect(workflow).toContain('if [ -z "${!name}" ]')
		expect(workflow).not.toContain('vars.PUBLIC_FIREBASE_')
	})

	it('type-checks and tests the client before it builds', () => {
		const workflow = readWorkflow('deploy.yml')
		const check = workflow.indexOf('run: pnpm check')
		const build = workflow.indexOf('run: pnpm run build')

		expect(check).toBeGreaterThan(-1)
		expect(check).toBeLessThan(workflow.indexOf('run: pnpm test:run'))
		expect(check).toBeLessThan(build)
	})

	it('runs Firebase deployment with Java 21 and the secret project ID', () => {
		const workflow = readWorkflow('deploy-firebase.yml')

		expect(workflow).toContain('uses: actions/setup-java@v5')
		expect(workflow).toMatch(/java-version:\s*["']?21/)
		expect(workflow).toContain(
			'--project "${{ secrets.PUBLIC_FIREBASE_PROJECT_ID }}"',
		)
		expect(workflow).not.toContain('vars.PUBLIC_FIREBASE_PROJECT_ID')
	})

	it('passes the optional App Check site key to the build without requiring it', () => {
		const workflow = readWorkflow('deploy.yml')
		const build = section(workflow, '- name: Build', '- name: Upload artifact')
		const guard = section(
			workflow,
			'- name: Validate Firebase configuration',
			'- name: Build',
		)

		expect(build).toContain(
			'PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: ${{ secrets.PUBLIC_FIREBASE_APP_CHECK_SITE_KEY }}',
		)
		expect(guard).not.toContain('APP_CHECK')
	})

	it('deploys the backend without stopping at Firebase CLI prompts', () => {
		const deploy = section(readWorkflow('deploy-firebase.yml'), 'pnpm firebase deploy')

		expect(deploy).toContain('--non-interactive')
		expect(deploy).toContain('--force')
	})

	it('writes App Check enforcement into the functions environment before deploying', () => {
		const workflow = readWorkflow('deploy-firebase.yml')
		const write = section(
			workflow,
			'- name: Write Functions environment',
			'- name: Deploy Firebase backend',
		)

		expect(write).toContain(
			"ENFORCE_APP_CHECK: ${{ vars.ENFORCE_APP_CHECK || 'false' }}",
		)
		expect(write).toContain('PROJECT_ID: ${{ secrets.PUBLIC_FIREBASE_PROJECT_ID }}')
		expect(write).toContain('true | false) ;;')
		expect(write).toContain('> "functions/.env.$PROJECT_ID"')
		expect(workflow.indexOf('run: pnpm test:firebase')).toBeLessThan(
			workflow.indexOf('- name: Write Functions environment'),
		)
		expect(
			readFileSync(resolve(process.cwd(), '.gitignore'), 'utf8').split('\n'),
		).toContain('.env.*')
	})

	it('runs the emulator and online suites on every push and pull request', () => {
		const workflow = readWorkflow('ci.yml')

		expect(workflow).toMatch(/^name: Online tests$/m)
		expect(workflow).toMatch(/push:\n\s+branches:\n\s+- "\*\*"/)
		expect(workflow).toMatch(/^ {2}pull_request:/m)
		expect(workflow).toContain('uses: actions/setup-java@v5')
		expect(workflow).toContain('distribution: temurin')
		expect(workflow).toMatch(/java-version:\s*["']?21/)
		expect(workflow).toContain('path: ~/.cache/firebase/emulators')
		expect(workflow).toContain('pnpm exec playwright install --with-deps chromium')
		const functions = workflow.indexOf('run: pnpm test:functions')
		const firebase = workflow.indexOf('run: pnpm test:firebase')
		const online = workflow.indexOf('run: pnpm test:e2e:online')
		expect(functions).toBeGreaterThan(-1)
		expect(firebase).toBeGreaterThan(functions)
		expect(online).toBeGreaterThan(firebase)
	})

	it('keeps the online tests away from secrets and deployments', () => {
		const workflow = readWorkflow('ci.yml')

		expect(workflow).not.toContain('secrets.')
		expect(workflow).not.toMatch(/firebase deploy|deploy-pages|id-token/)
		expect(workflow).toMatch(/permissions:\n\s+contents: read\n/)
	})
})
