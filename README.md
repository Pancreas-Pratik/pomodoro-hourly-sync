# Minimal Pomo — static Discord Activity

No backend, database, polling, WebSockets, login, tokens, sounds, or background images. The countdown and every control run locally, immediately.

## How synchronization works

Every open starts in hourly mode: focus from :00 to :50, break from :50 to :00, using America/New_York (EST/EDT automatically). At 8:10 PM it shows 40 minutes of focus; at 8:55 PM it shows 5 minutes of break.

Each device independently calculates this same schedule from its clock. Accurate device clocks are required. Clicking Synchronize to the hour returns that device to the schedule; it does not send anything to other participants. Pause, Reset, and custom durations affect only the current device. Reloading starts in hourly mode again.

Applying durations restarts focus while preserving running/paused status. Pausing exits hourly mode and preserves remaining time. Custom cycles repeat automatically.

## Open without a server

Open **dist/index.html** directly in a browser. It is a standalone HTML file with the styles and timer code included. No local server is needed.

## Build and test

With Node installed:

```sh
npm install
npm run build
npm test
```

Rendering runs once per displayed second, changes only text that needs updating, and stops while the page is hidden. Returning to the tab recalculates from the clock, so sleeping does not accumulate countdown drift.

## Use inside Discord

1. Create a Discord application and enable Activities in the Developer Portal.
2. Put its public application ID in public/config.mjs, then build again. No client secret or bot token is used.
3. Upload the two files from dist/ to static HTTPS hosting. There is no server process to deploy.
4. Map the Activity's root URL prefix `/` to that static hostname in Discord's URL Mappings.
5. Launch the Activity in Discord. Everyone initially follows the hourly schedule independently.

Discord still needs a public HTTPS URL to load an Activity's files. Static file hosting is all this project needs. A running computer, database, and synchronization backend are not required. Actual launch inside Discord must still be verified with your app ID and hosted URL.

Reference behavior: https://github.com/corentin-dupaigne/pomopensource . This is a separate implementation, not a fork.

## People in the Activity

The optional names list uses Discord's native `getInstanceConnectedParticipants()` command and `ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE` event. It shows people in this same Activity instance, not every member of the server or everyone in the voice channel. No presence backend, polling, avatars, or extra media requests are added. Names are only held in the page, never saved.

Discord documents these features as requiring no extra scopes, but their availability without an authenticated SDK session must be verified in the live Discord client. If access is rejected, the app shows that the participant list is unavailable; the timer continues. This build intentionally has no OAuth token exchange or backend fallback.

## GitHub Pages

The build also creates `docs/` with the static files for GitHub Pages. In repository Settings → Pages, choose **Deploy from a branch**, branch **main**, folder **/docs**, and Save. All assets use relative paths, so a repository-based Pages address works.

For later changes, edit the source files (`src/index.html`, `public/app.mjs`, `public/style.css`, and `public/timer.mjs`), run `npm run build` and `npm test`, then commit and push the updated source and `docs/`. GitHub automatically republishes the site from `docs/`. The standalone `public/index.html` is generated; edit `src/index.html` instead.
