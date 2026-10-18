> Superseded: this is a dated spec kept for history. README.md is the source of truth; later changes include an Online nav card with a Local/Online switch, starting once at least two players are ready, forfeiting on leave, removing idle players, Functions in `asia-southeast1` configured from repository secrets, Guessle (daily) and Random in place of `single`, and no New Game button.

# Firebase Online Multiplayer Design

**Status:** Approved for implementation planning  
**Date:** 2026-07-27

## Goal

Add cheat-resistant online multiplayer rooms for two to four players while preserving single-player and local pass-and-play modes.

Players enter a display name, create a room or join with a six-character room ID, submit a private secret number, and play the existing elimination game in real time.

## Non-goals

- Replacing GitHub Pages hosting.
- Removing or rewriting local multiplayer.
- Permanent user accounts, profiles, matchmaking, chat, spectators, or rankings.
- Automatic elimination after an unexpected disconnect.
- Production Firebase access from automated tests.

## Product decisions

- Add `online` as a third `GameMode`.
- Online rooms support a host-configured capacity of two to four players.
- Use Firebase Anonymous Authentication, Cloud Firestore, and callable Cloud Functions.
- Keep every secret number server-only.
- Route every authoritative mutation through a callable Function.
- Keep GitHub Pages for the web client.
- Add Firebase deployment automation for Functions, Firestore rules, and indexes.

## Player flow

1. The player selects **Online Multiplayer** in settings.
2. The player enters a display name.
3. The player creates a room with the selected digit count and capacity, or joins by room ID.
4. The lobby shows the room ID, copy control, player list, capacity, and readiness.
5. Each player privately submits a secret number.
6. The host starts after the configured number of players has joined and every player is ready.
7. The active player chooses another active player and submits a guess.
8. The server returns feedback, updates the public history, and advances the game.
9. The last active player wins.
10. Refreshing the same browser restores the anonymous identity and room session.

## Game rules

Online multiplayer preserves the current local rules:

- Secret and guess length use the host's two-to-five digit setting.
- A player cannot target themselves or an eliminated player.
- A correct guess eliminates the target.
- A correct guess keeps the current player's turn.
- An incorrect guess rotates to the next non-eliminated player in seat order.
- The game finishes when one active player remains.

## Architecture

### Client

The static SvelteKit application uses the modular Firebase Web SDK.

- `src/lib/firebase/client.ts` initializes Auth, Firestore, and Functions from public environment variables.
- `src/lib/services/onlineGameService.ts` owns authentication, callable invocations, Firestore subscriptions, and error normalization.
- `src/lib/stores/gameStore.ts` remains the only shared application store. It gains online state and intent-based actions that apply service results and snapshots.
- `src/lib/components/OnlineMultiplayerGame.svelte` renders entry, lobby, guessing, reconnecting, and finished states.
- `SettingsModal.svelte` exposes Single Player, Local Multiplayer, and Online Multiplayer.
- `+page.svelte` renders the online component for `mode === 'online'`.

Component-local form values use Svelte 5 runes. Firebase data does not create a second Svelte store.

### Firebase

- Anonymous Auth assigns a stable UID to each browser profile.
- Firestore holds the public room projection and drives real-time subscriptions.
- Callable Functions validate and execute every authoritative command.
- Firestore transactions protect capacity, phases, turn order, readiness, elimination, and winner selection.
- The Admin SDK reads and writes private secrets.
- A scheduled Function removes rooms that have been inactive for 24 hours.

## Data model

### Public room

`rooms/{roomId}`

| Field | Type | Purpose |
| --- | --- | --- |
| `hostUid` | string | Current host |
| `phase` | `lobby \| guessing \| finished` | Room phase |
| `digitCount` | number | Two to five digits |
| `maxPlayers` | number | Two to four players |
| `playerOrder` | string[] | Stable seat order |
| `currentGuesserUid` | string or null | Active turn |
| `winnerUid` | string or null | Finished-game winner |
| `turnNumber` | number | Monotonic command guard |
| `createdAt` | timestamp | Creation time |
| `updatedAt` | timestamp | Last successful command |
| `expiresAt` | timestamp | Cleanup threshold |

### Public players

`rooms/{roomId}/players/{uid}`

| Field | Type | Purpose |
| --- | --- | --- |
| `name` | string | Trimmed display name, 1–20 characters |
| `seat` | number | Stable order |
| `ready` | boolean | Secret has been submitted |
| `eliminated` | boolean | Player is no longer active |
| `joinedAt` | timestamp | Join order fallback |

### Public guesses

`rooms/{roomId}/guesses/{guessId}`

| Field | Type | Purpose |
| --- | --- | --- |
| `turnNumber` | number | Guess order |
| `guesserUid` | string | Acting player |
| `targetUid` | string | Target player |
| `guess` | string | Submitted guess |
| `correct` | boolean | Exact match |
| `correctDigits` | number | Existing feedback rule |
| `correctPositions` | number | Existing feedback rule |
| `createdAt` | timestamp | Server time |

### Private secrets

`roomSecrets/{roomId}/players/{uid}`

| Field | Type | Purpose |
| --- | --- | --- |
| `number` | string | Server-only target |
| `updatedAt` | timestamp | Last lobby submission |

Clients cannot read, list, create, update, or delete `roomSecrets`.

## Callable Functions

Every callable requires an authenticated Firebase user.

### `createRoom`

Input: `{ name, digitCount, maxPlayers }`  
Output: `{ roomId }`

- Validates the name and settings.
- Generates a collision-checked six-character uppercase ID.
- Creates the room and host player in one transaction.

### `joinRoom`

Input: `{ roomId, name }`  
Output: `{ roomId }`

- Normalizes the ID to uppercase.
- Rejects missing, started, expired, or full rooms.
- Adds the authenticated user once and assigns the next seat.
- Treats a repeated call by the same UID as an idempotent reconnect.

### `setSecret`

Input: `{ roomId, number }`  
Output: `{ ready: true }`

- Accepts only room members during the lobby.
- Validates the configured digit count.
- Writes the number to the private collection.
- Marks the public player ready.
- Allows replacement until the game starts.

### `startRoom`

Input: `{ roomId }`  
Output: `{ phase: 'guessing' }`

- Requires the host.
- Requires exactly `maxPlayers` members and every member ready.
- Sets the first non-eliminated seat as the current guesser.

### `submitGuess`

Input: `{ roomId, targetUid, guess, turnNumber }`  
Output: `{ guessId, correct, correctDigits, correctPositions }`

- Requires membership, guessing phase, matching turn, and current-guesser ownership.
- Rejects self-targeting and eliminated targets.
- Reads the target secret with the Admin SDK.
- Uses the existing feedback algorithm.
- Writes the guess and authoritative room/player updates transactionally.
- Keeps the turn after a correct guess.
- Rotates after an incorrect guess.
- Finishes the room when one active player remains.

### `leaveRoom`

Input: `{ roomId }`  
Output: `{ left: true }`

- Removes a player only during the lobby or after the game finishes.
- Transfers host ownership to the earliest remaining seat.
- Recursively deletes public subcollections, the room document, and private secrets when the last member leaves.
- Rejects voluntary leave during an active match.

### `restartRoom`

Input: `{ roomId }`  
Output: `{ phase: 'lobby' }`

- Requires the host after a finished game.
- Clears guesses, winner, turn state, readiness, elimination, and private secrets.
- Keeps the room ID and current members.

### `cleanupExpiredRooms`

- Runs on a schedule.
- Deletes public room data, subcollections, and private secrets when `expiresAt` is in the past.
- Successful room commands extend `expiresAt` to 24 hours after the command.

## Security rules

- All client access requires `request.auth != null`.
- A user may read a room and its public subcollections only when `rooms/{roomId}/players/{request.auth.uid}` exists.
- Clients cannot write room, player, or guess documents directly.
- Clients have no access to `roomSecrets`.
- Cloud Functions use the Admin SDK and repeat all membership and state validation.
- Rules tests cover nonmembers, members, direct writes, secret reads, and cross-room access.

## Session and reconnect behavior

- Firebase Auth uses browser-local persistence.
- The client stores only the current room ID in local storage.
- On startup, the service restores Auth, verifies membership, and resubscribes.
- An unexpected disconnect does not eliminate the player.
- The room waits for the missing player; the same browser can refresh and resume.
- A user can clear the stale local room reference if the room expired or membership no longer exists.

Firestore is not used for precise presence in this version.

## UI states

### Entry

- Display-name input.
- Create Room action.
- Room-ID input and Join Room action.

### Lobby

- Six-character room ID and copy action.
- Host badge, configured capacity, digit count, and player list.
- Private secret input and ready status.
- Host-only start action, disabled until the room is full and all players are ready.
- Leave action.

### Guessing

- Public player cards and guess history.
- Current-turn indicator.
- Target selector excluding self and eliminated players.
- Guess input enabled only for the current player.
- Read-only waiting state for other players.

### Finished

- Winner announcement.
- Host-only restart action.
- Leave action.

All states reuse existing glass-panel, input, button, player-card, feedback-banner, focus, motion, and responsive patterns. No new color or typography token is required.

## Error handling

The service maps callable errors to stable UI messages.

| Condition | Callable code | UI behavior |
| --- | --- | --- |
| Missing authentication | `unauthenticated` | Retry anonymous sign-in |
| Invalid name, ID, secret, or guess | `invalid-argument` | Inline field/banner error |
| Missing or expired room | `not-found` | Return to entry |
| Nonmember or nonhost action | `permission-denied` | Banner; keep current state |
| Full room | `resource-exhausted` | Return to entry |
| Wrong phase, readiness, target, or turn | `failed-precondition` | Refresh from snapshot |
| Transaction contention | `aborted` | Offer retry |
| Offline or unavailable Firebase | `unavailable` | Reconnecting banner |
| Unknown server error | `internal` | Generic retry message |

Secret inputs are cleared after successful submission. Secrets are never copied into public snapshots, local storage, analytics, or logs.

## Testing

### Unit

- Validate names, IDs, digit settings, secrets, and guesses.
- Test feedback, turn rotation, correct-turn retention, elimination, winner selection, and error mapping.
- Keep server game rules in pure functions so Functions tests do not require Firestore.

### Component

- Mock `onlineGameService`.
- Cover entry, create, join, normalized IDs, lobby, readiness, host controls, waiting turns, guessing, reconnecting, errors, restart, and finished state.
- Assert semantic labels, roles, focus, and disabled controls.

### Firebase emulator

- Test Auth, Firestore rules, callable Functions, and transactions with the Emulator Suite.
- Verify room-capacity races, duplicate joins, stale turns, cross-room reads, direct-write denial, secret denial, and cleanup.
- Never connect automated tests to production Firebase.

### End-to-end

- Use separate Playwright browser contexts for distinct anonymous users.
- Cover create → join → ready → start → incorrect guess → correct guess → elimination → winner.
- Add a three/four-player turn-rotation flow.
- Cover refresh/reconnect and room error states.

## Configuration and deployment

### Repository files

- Add `firebase.json`, Firestore rules, Firestore indexes, and `functions/`.
- Add `.env.example` with placeholder `PUBLIC_FIREBASE_*` variables.
- Add Firebase web, Functions, Admin, CLI, emulator/rules-test, and required build dependencies.
- Commit no `.env`, service-account JSON, token, or credential.

### Firebase project setup

- Create or select a Firebase project.
- Enable Anonymous Authentication.
- Create the Firestore database.
- Deploy Functions, rules, and indexes.
- Use `us-central1` for Functions unless the deployment explicitly changes both client and server configuration.

### GitHub Actions

- Keep the existing GitHub Pages deployment.
- Inject `PUBLIC_FIREBASE_API_KEY`, `PUBLIC_FIREBASE_AUTH_DOMAIN`, `PUBLIC_FIREBASE_PROJECT_ID`, `PUBLIC_FIREBASE_STORAGE_BUCKET`, `PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, and `PUBLIC_FIREBASE_APP_ID` into the Pages build using repository variables.
- Add a Firebase backend workflow for Functions, rules, and indexes.
- Authenticate the backend workflow with a `FIREBASE_SERVICE_ACCOUNT` GitHub repository secret.
- Document all required variables and secrets in README.

## Documentation updates

Implementation updates README:

- Stack and architecture.
- Firebase setup and local emulator commands.
- Online multiplayer behavior.
- Security and testing rules.
- Design-system file map.
- Deployment variables and workflow.
- Decision log.

## Acceptance criteria

- Single-player and local multiplayer continue to work.
- Two to four remote browsers can create or join one room by ID.
- Names and public state synchronize in real time.
- Secret numbers are never readable by clients.
- Only the server can mutate authoritative game state.
- Invalid, stale, unauthorized, and concurrent actions are rejected.
- Refreshing the same browser restores the room.
- Required unit, component, emulator, and end-to-end tests pass.
- `pnpm check`, `pnpm test:run`, and affected Playwright flows pass.
- The production build works on GitHub Pages with configured Firebase variables.
- Firebase backend deployment contains no committed credentials.
