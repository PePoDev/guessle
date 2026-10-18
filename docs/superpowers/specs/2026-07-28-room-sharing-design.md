> Superseded: this is a dated spec kept for history. README.md is the source of truth; later changes include the move from `number-guesser.pepo.dev` to `guessle.pepo.dev` and the Guessle name in invites.

# Online Room Sharing Design

**Date:** 2026-07-28

## Goal

Make an online room easy to invite another player into:

- Copying the room ID gives immediate confirmation.
- Sharing sends a link that opens Online Multiplayer with the room ID filled in.
- The invited player only needs to enter a display name and select Join Room.

## User experience

The lobby places a **Share** secondary button immediately after **Copy Room ID**.

Selecting **Copy Room ID** writes the six-character room ID to the clipboard and shows a **Copied!** tooltip for two seconds.

Selecting **Share** builds an invite URL using the current page URL and a `room` query parameter, for example:

```text
https://number-guesser.pepo.dev/?room=AB2C3D
```

When the Web Share API is available, the browser opens its native share sheet with the game title, invitation text, and invite URL. If Web Share is unavailable or fails, the app copies the invite URL and shows a **Link copied!** tooltip for two seconds.

Opening a valid invite URL automatically selects Online Multiplayer and pre-fills the normalized room ID. It does not join automatically because the guest must provide a display name.

## Architecture and data flow

`src/routes/+page.svelte` reads the `room` query parameter once during browser initialization. A six-character room ID using the existing room alphabet switches the store to online mode. The value is passed to `OnlineMultiplayerGame.svelte` as an optional initial room ID.

`OnlineMultiplayerGame.svelte` owns the temporary copy/share feedback as component-local state. It builds the invite URL from `window.location`, replacing any existing `room` parameter while preserving the deployed origin and pathname.

No Firebase documents, callable Functions, shared game state, or dependencies change.

## Error handling and accessibility

- Clipboard or share failures use the existing online error banner.
- A cancelled or failed native share attempt falls back to copying the link.
- Temporary tooltips remain visible for two seconds and use the accessible `status` role.
- Both controls use the existing secondary-button visual contract and wrap on narrow screens.
- Invalid query values are ignored and leave the normal game mode unchanged.

## Testing

Component tests will verify:

- Copy Room ID writes only the room ID and shows **Copied!**.
- Share calls the Web Share API with the full invite URL.
- Missing or failed Web Share falls back to copying the invite URL and shows **Link copied!**.
- An initial room ID pre-fills the join form.

The online Playwright suite will open `/?room=AB2C3D`, verify Online Multiplayer is selected, verify the room field is filled, and join after entering only a display name.

The README design system will document the paired lobby actions, temporary confirmation state, and invite-link behavior.
