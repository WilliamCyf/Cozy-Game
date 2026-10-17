# Cozy Cove: notes for Claude

## MAIN PRIORITY (always, for every change: new features, removals, fixes)
The game must **never be laggy, never be buggy, and never make the iPhone hot**.
Check every change against this before calling it done:
- No work every frame that could be done once (cache results; recompute only when a value changes).
- No new objects/strings/arrays created every frame (garbage collection causes stutters and heat).
- Keep draw calls, triangles and texture sizes low; respect the frame cap (new phones: 60 fps with the
  heat guard in src/render/pacer.js, which drops to 30 when the phone can't keep up) and adaptive resolution.
  Run `node tests/pacer.mjs` after touching frame timing.
- Anything new must stop when the app is hidden and stay idle-friendly.
- Test it (tests/*.mjs) and look at screenshots before pushing.

## Publishing (docs/ is the LIVE game the family plays: every push to it goes straight to their phones)
- Never publish a feature that isn't finished end to end. (Lesson: a language button went live
  before the translations existed. On the phone it looked like "the button doesn't work".)
- Test the way a person uses it, starting from the *other* state: an English phone switching to
  Thai, a returning player, switching during a game. Not only the default path.
- Phones keep a copy of the game (service worker). After changing src/sw.js or the update code,
  run `node tests/update.mjs` (pretend GitHub Pages with its 10-minute caching).

## Languages (English + Thai)
- `src/i18n/i18n.js`: `t('English text {x}', { x })` for text shown on this phone.
- Text made on the host and sent to other phones: `T('English {x}', { x })` message objects,
  shown with `tr(msg)` on each phone in its own language. Nested names: `T(item.name)`.
- Never build the key from a template literal (`t(\`Hi ${name}\`)` cannot be translated).
- Same English word, two meanings? Add a context: `t('action|Fish')` (English shows "Fish").
- Text made once at start-up (e.g. button labels): mark it `N_('Shop')` and translate it where it
  is shown, so switching language mid-game updates it.
- Thai translations live in `src/i18n/th/*.js` (English sentence -> Thai sentence).
- Check with `node tools/i18n-check.mjs`.
- Per-frame code: a plain `t('Label')` is a cheap lookup, but `t()` with `{params}` or `tr()` builds a
  new string, so cache it and rebuild only when the value changes (see the clock in ui.js).

## Working on this repo
- Build: `npm run build` (src/ -> docs/). Serve: `npm run serve` (port 8080).
- Branch: `claude/serene-gates-rdurpz`.
- The owner is a beginner coder: explain changes in plain language with real-world analogies.
