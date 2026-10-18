> Superseded: this is a dated spec kept for history. README.md is the source of truth; later changes include Guessle (daily) and Random in place of `single`, a Settings gear that always offers language and sound, an icon-only link to `PePoDev/guessle`, and Thai numerals in digit fields.

# Mode Settings, GitHub Stars, and Digit Input Design

## Goal

Move settings out of global navigation and into each game mode, add a live GitHub star link, and prevent non-digit characters in every secret and guess field.

## Approved behavior

### Per-mode settings

- Remove the green Settings card from the navigation rail.
- Show a Settings button within the active game-mode panel.
- Reuse the existing accessible modal, but lock it to the active mode and remove the Game Mode selector.
- Single Player settings contain Number of Digits and Max Attempts.
- Local Multiplayer settings contain Number of Digits and Number of Players.
- Online Multiplayer settings contain Number of Digits and Number of Players while the player is on the room entry screen.
- Hide the Online Settings button after a room has been created or joined because the room is then authoritative.
- Preserve the current behavior where changing a setting immediately applies it and starts a fresh Single Player or Local Multiplayer game.

### GitHub star link

- Place a compact `GitHub ★ <count>` link at the top-right of the cream game panel.
- Link to `https://github.com/PePoDev/number-guesser` in a new tab with safe external-link attributes.
- Fetch repository metadata once per page mount from `GET https://api.github.com/repos/PePoDev/number-guesser`.
- Send GitHub's recommended REST headers and read the `stargazers_count` response field after narrowing the response from `unknown`.
- During loading or after any error, keep the functional `GitHub ★` link visible without a count.
- Do not show an error, block the game, retry, add authentication, or log failures.
- Unauthenticated GitHub REST requests are limited to 60 requests per hour per originating IP. One best-effort request per page load is acceptable for this static site.

### Digits-only fields

- Keep number entry as text so leading zeroes remain intact.
- Filter typed and pasted content to ASCII digits `0–9`.
- Continue enforcing each field's existing maximum digit count.
- Apply the behavior to:
  - Single Player guesses.
  - Local Multiplayer secret numbers and guesses.
  - Online Multiplayer secret numbers and guesses.
- Names and room IDs retain their existing behavior.

## Architecture

### Settings

`SettingsModal.svelte` receives the active game mode as a prop. It derives its title and visible fields from that prop while keeping its existing focus trap, Escape handling, backdrop handling, and focus restoration.

`+page.svelte` owns the modal's open state and renders the per-mode Settings trigger alongside the active mode controls. It suppresses the trigger when Online Multiplayer has an active room.

### GitHub stars

Create `GitHubStarLink.svelte` as an isolated visual and network boundary. The component owns only its local star-count state, performs one fetch on mount, and renders an ordinary external link regardless of request status. It introduces no shared store state and no dependency.

### Digit sanitization

Add an exported pure `sanitizeDigits(value, maxLength)` helper to `gameStore.ts`, consistent with the project's pure-logic location. Components use the helper from input handlers and update both the DOM value and component state so paste, typing, and leading zeroes behave consistently.

## Error handling

- Invalid GitHub responses, non-success status codes, rate limits, and network errors silently leave the GitHub link in its count-free fallback state.
- Digit sanitization removes unsupported characters rather than raising a validation error.
- Existing length validation and submit-button states remain unchanged.
- Settings remain unavailable during an active online room rather than implying that local changes can alter server-owned room configuration.

## Accessibility and responsive behavior

- The Settings trigger has an accessible name that includes the active mode.
- The modal title identifies the active mode.
- The GitHub link's accessible name includes the star count when available.
- Existing focus, keyboard, and modal semantics remain intact.
- Both new controls wrap within the existing panel header on narrow screens and use existing button, border, color, typography, focus, and motion patterns.
- No new visual token or breakpoint is required.

## Testing

- Unit-test `sanitizeDigits` for letters, punctuation, pasted mixed content, maximum length, and leading zeroes.
- Component-test every Settings modal variant and verify that the mode selector is gone.
- Component-test the GitHub link for loading, success, malformed data, and request failure with mocked fetches only.
- Update page tests for the removed nav card, per-mode Settings triggers, active-online suppression, and top-right GitHub link.
- Update Single Player, Local Multiplayer, and Online Multiplayer component tests to prove secrets and guesses reject non-digits while preserving valid digits and leading zeroes.
- Update affected Playwright flows to use the new per-mode Settings trigger and verify at least one typed or pasted mixed-value path per game surface.
- Stub GitHub API requests in automated browser tests so no test depends on the network.
- Run `pnpm check`, `pnpm test:run`, affected Playwright suites, and `pnpm build`.

## Documentation

Update README's architecture map, Design system component table, file map, keyboard/navigation wording, and decision log. Testing layout remains unchanged.

## Out of scope

- GitHub authentication, persistent caching, retries, or a custom star-count backend.
- Changing room IDs or names to digits-only.
- Editing authoritative settings after an online room exists.
- New dependencies, tokens, breakpoints, or visual redesign.
