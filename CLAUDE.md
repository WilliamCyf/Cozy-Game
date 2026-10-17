# Cozy Cove: notes for Claude

## MAIN PRIORITY (always, for every change: new features, removals, fixes)
The game must **never be laggy, never be buggy, and never make the iPhone hot**.
Check every change against this before calling it done:
- No work every frame that could be done once (cache results; recompute only when a value changes).
- No new objects/strings/arrays created every frame (garbage collection causes stutters and heat).
- Keep draw calls, triangles and texture sizes low; respect the 30 fps cap and adaptive resolution.
- Anything new must stop when the app is hidden and stay idle-friendly.
- Test it (tests/*.mjs) and look at screenshots before pushing.

## Languages (English + Thai)
- `src/i18n/i18n.js`: `t('English text {x}', { x })` for text shown on this phone.
- Text made on the host and sent to other phones: `T('English {x}', { x })` message objects,
  shown with `tr(msg)` on each phone in its own language. Nested names: `T(item.name)`.
- Never build the key from a template literal (`t(\`Hi ${name}\`)` cannot be translated).
- Thai translations live in `src/i18n/th/*.js` (English sentence -> Thai sentence).
- Check with `node tools/i18n-check.mjs`.
- Never call t()/tr() every frame; cache the text and update it only when the value changes.

## Working on this repo
- Build: `npm run build` (src/ -> docs/). Serve: `npm run serve` (port 8080).
- Branch: `claude/serene-gates-rdurpz`.
- The owner is a beginner coder: explain changes in plain language with real-world analogies.
