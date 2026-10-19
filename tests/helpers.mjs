// Small steps the browser tests share.

// From the start screen of a phone with no island: "🌱 Start a new family island" -> make your islander
// (if this phone has none yet) -> "🌱 Start a new island". `fill`: the name to type, if asked.
export async function startNewIsland(p, fill = 'Mum') {
  await p.waitForSelector('.screen.title.in .title-buttons .btn.ghost', { timeout: 90000 });
  await p.tap('.screen.title.in .title-buttons .btn.ghost'); // (the first plain button: start a new island)
  await p.waitForSelector('.screen.profile.in .name-input, .screen.join.in .col-buttons', { timeout: 30000 });
  if (await p.$('.screen.profile.in .name-input')) {
    await p.fill('.name-input', fill);
    await p.tap('.look-editor .btn.primary');
  }
  await p.waitForSelector('.screen.join.in .col-buttons .btn.primary', { timeout: 30000 });
  await p.tap('.screen.join.in .col-buttons .btn.primary');
  await p.waitForFunction(() => window.__game?.session?.state, null, { timeout: 90000 });
}
