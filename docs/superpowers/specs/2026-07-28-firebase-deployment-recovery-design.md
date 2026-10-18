> Superseded: this is a dated spec kept for history. README.md is the source of truth; later changes include the Blaze plan, API, and role prerequisites and the `--non-interactive --force` deploy, because this change alone did not get the backend deployed.

# Firebase Deployment Recovery Design

## Problem

The static client deployed with all Firebase configuration values empty because
the workflows read repository variables while the configured values are
repository secrets. The backend workflow also stops before deployment because
the Firebase Emulator Suite requires Java 21.

## Approaches

1. **Use the existing repository secrets (approved).** Update both workflows to
   read `secrets.PUBLIC_FIREBASE_*`, add Java 21 to the backend job, and reject
   missing client configuration before building. This restores deployment
   without re-entering configuration.
2. **Re-enter the six values as repository variables.** This preserves the
   current workflow expressions but duplicates configuration work and still
   requires the Java fix.
3. **Load Firebase configuration at runtime.** This avoids build-time injection
   but adds an unnecessary endpoint and failure mode.

## Design

- The Pages build receives the six public Firebase values from the existing
  GitHub secrets.
- A pre-build check names any missing configuration variable without printing
  its value, then stops the deployment.
- The backend job installs Temurin Java 21 before running emulator tests.
- The backend deploy command reads the project ID from the existing secret.
- The README records secrets as the deployment configuration source.

No Firebase values are committed, printed, or moved into client storage beyond
the public configuration already embedded by the production build.

## Testing

A Vitest regression test reads both workflow files and verifies:

- the Pages workflow uses secrets for every required Firebase value;
- the Pages workflow contains the missing-configuration guard;
- the backend workflow configures Java 21; and
- the backend deploy uses the secret project ID.

The normal `pnpm check`, `pnpm test:run`, and production build remain the final
verification gates.
