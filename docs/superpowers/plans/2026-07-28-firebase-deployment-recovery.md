> Superseded: this is a dated plan kept for history. README.md is the source of truth; later changes include the Blaze plan, API, and role prerequisites and the `--non-interactive --force` deploy, because this change alone did not get the backend deployed.

# Firebase Deployment Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing GitHub Pages and Firebase backend workflows consume the configured secrets, reject empty client configuration, and run Firebase tests with Java 21.

**Architecture:** Keep Firebase configuration build-time injected. Add a structural Vitest regression test for the two workflow contracts, then make the smallest YAML and README changes needed to satisfy it.

**Tech Stack:** GitHub Actions, Firebase CLI, Node.js 22, Temurin Java 21, Vitest, TypeScript

---

## File Structure

- Create `src/tests/deploymentWorkflows.test.ts`: regression coverage for deployment workflow requirements.
- Modify `.github/workflows/deploy.yml`: inject existing secrets and fail before an empty Firebase build.
- Modify `.github/workflows/deploy-firebase.yml`: install Java 21 and use the secret project ID.
- Modify `README.md`: document the deployment secret source and workflow-test coverage.

### Task 1: Add the failing workflow regression test

**Files:**
- Create: `src/tests/deploymentWorkflows.test.ts`

- [x] **Step 1: Write the failing test**

```typescript
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

describe('deployment workflows', () => {
	it('builds the Pages client from validated Firebase secrets', () => {
		const workflow = readWorkflow('deploy.yml')

		for (const name of firebaseConfigNames) {
			expect(workflow).toContain(`${name}: \${{ secrets.${name} }}`)
		}
		expect(workflow).toContain('if [ -z "${!name}" ]')
		expect(workflow).not.toContain('vars.PUBLIC_FIREBASE_')
	})

	it('runs Firebase deployment with Java 21 and the secret project ID', () => {
		const workflow = readWorkflow('deploy-firebase.yml')

		expect(workflow).toContain('uses: actions/setup-java@v4')
		expect(workflow).toMatch(/java-version:\s*["']?21/)
		expect(workflow).toContain(
			'--project "${{ secrets.PUBLIC_FIREBASE_PROJECT_ID }}"',
		)
		expect(workflow).not.toContain('vars.PUBLIC_FIREBASE_PROJECT_ID')
	})
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm vitest run src/tests/deploymentWorkflows.test.ts
```

Expected: FAIL because `deploy.yml` contains `vars.PUBLIC_FIREBASE_*` and no
guard, while `deploy-firebase.yml` has no `actions/setup-java@v4` step.

### Task 2: Repair both deployment workflows

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `.github/workflows/deploy-firebase.yml`
- Test: `src/tests/deploymentWorkflows.test.ts`

- [x] **Step 1: Add a missing-configuration guard to the Pages workflow**

Insert before the Build step:

```yaml
      - name: Validate Firebase configuration
        env:
          PUBLIC_FIREBASE_API_KEY: ${{ secrets.PUBLIC_FIREBASE_API_KEY }}
          PUBLIC_FIREBASE_AUTH_DOMAIN: ${{ secrets.PUBLIC_FIREBASE_AUTH_DOMAIN }}
          PUBLIC_FIREBASE_PROJECT_ID: ${{ secrets.PUBLIC_FIREBASE_PROJECT_ID }}
          PUBLIC_FIREBASE_STORAGE_BUCKET: ${{ secrets.PUBLIC_FIREBASE_STORAGE_BUCKET }}
          PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.PUBLIC_FIREBASE_MESSAGING_SENDER_ID }}
          PUBLIC_FIREBASE_APP_ID: ${{ secrets.PUBLIC_FIREBASE_APP_ID }}
        run: |
          required=(
            PUBLIC_FIREBASE_API_KEY
            PUBLIC_FIREBASE_AUTH_DOMAIN
            PUBLIC_FIREBASE_PROJECT_ID
            PUBLIC_FIREBASE_STORAGE_BUCKET
            PUBLIC_FIREBASE_MESSAGING_SENDER_ID
            PUBLIC_FIREBASE_APP_ID
          )
          for name in "${required[@]}"; do
            if [ -z "${!name}" ]; then
              echo "::error::$name is not configured"
              exit 1
            fi
          done
```

- [x] **Step 2: Change the Pages Build step from variables to secrets**

Keep `NODE_ENV` and the functions region unchanged, replacing each
`vars.PUBLIC_FIREBASE_*` expression with its matching
`secrets.PUBLIC_FIREBASE_*` expression:

```yaml
      - name: Build
        run: pnpm run build
        env:
          NODE_ENV: production
          PUBLIC_FIREBASE_API_KEY: ${{ secrets.PUBLIC_FIREBASE_API_KEY }}
          PUBLIC_FIREBASE_AUTH_DOMAIN: ${{ secrets.PUBLIC_FIREBASE_AUTH_DOMAIN }}
          PUBLIC_FIREBASE_PROJECT_ID: ${{ secrets.PUBLIC_FIREBASE_PROJECT_ID }}
          PUBLIC_FIREBASE_STORAGE_BUCKET: ${{ secrets.PUBLIC_FIREBASE_STORAGE_BUCKET }}
          PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.PUBLIC_FIREBASE_MESSAGING_SENDER_ID }}
          PUBLIC_FIREBASE_APP_ID: ${{ secrets.PUBLIC_FIREBASE_APP_ID }}
          PUBLIC_FIREBASE_FUNCTIONS_REGION: asia-southeast1
```

- [x] **Step 3: Install Java 21 in the Firebase backend workflow**

Insert after Setup Node:

```yaml
      - name: Setup Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "21"
```

- [x] **Step 4: Use the secret project ID for backend deployment**

```yaml
      - name: Deploy Firebase backend
        run: >
          pnpm firebase deploy
          --project "${{ secrets.PUBLIC_FIREBASE_PROJECT_ID }}"
          --only functions,firestore:rules,firestore:indexes
          --non-interactive
```

- [x] **Step 5: Run the focused test and verify GREEN**

Run:

```bash
pnpm vitest run src/tests/deploymentWorkflows.test.ts
```

Expected: PASS, 2 tests passed.

### Task 3: Update deployment and testing documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-28-firebase-deployment-recovery.md`

- [x] **Step 1: Document the workflow regression test**

Add this row to the Testing table:

```markdown
| Deployment | `src/tests/deploymentWorkflows.test.ts` | Secret injection, missing-config guard, and Java runtime requirements |
```

- [x] **Step 2: Document repository secrets as the configuration source**

Change the Deployment section to:

```markdown
Before the first backend deploy, create the Firestore database and enable Anonymous Auth. Configure these GitHub repository secrets:
```

Retain the six existing `PUBLIC_FIREBASE_*` entries and the existing
`FIREBASE_SERVICE_ACCOUNT` instruction.

- [x] **Step 3: Mark completed plan items**

Change every completed checkbox in this plan from `- [ ]` to `- [x]`.

### Task 4: Verify and commit

**Files:**
- Test: `src/tests/deploymentWorkflows.test.ts`
- Verify: `.github/workflows/deploy.yml`
- Verify: `.github/workflows/deploy-firebase.yml`
- Verify: `README.md`

- [x] **Step 1: Run required checks**

```bash
pnpm check
pnpm test:run
pnpm build
```

Expected: all commands exit 0 with zero test failures and zero Svelte/TypeScript
errors or warnings.

- [x] **Step 2: Inspect the final diff**

```bash
git diff --check
git diff -- .github/workflows/deploy.yml .github/workflows/deploy-firebase.yml README.md src/tests/deploymentWorkflows.test.ts docs/superpowers/plans/2026-07-28-firebase-deployment-recovery.md
```

Expected: no whitespace errors; only the approved deployment repair,
regression test, plan, and documentation changes are present.

- [x] **Step 3: Commit only the deployment recovery files**

```bash
git add .github/workflows/deploy.yml .github/workflows/deploy-firebase.yml README.md src/tests/deploymentWorkflows.test.ts docs/superpowers/plans/2026-07-28-firebase-deployment-recovery.md
git commit -m "fix: repair Firebase deployment configuration"
```
