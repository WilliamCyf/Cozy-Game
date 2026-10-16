// What's inside each pop-up panel (basket, journal, family board, shop, cooking…).
import { h, tapButton } from './dom.js';
import { ITEMS, FISH, FISH_BY_ID, JOURNAL_FISH, RARITY, CROPS, RECIPES, SHOP, PROJECTS, PROJECT_BY_ID } from '../game/data.js';
import { HATS } from '../entities/character.js';
import { buildLookEditor, hatEmoji } from './lookeditor.js';
import { fishSVG } from './fishart.js';
import { QUALITY } from '../render/renderer.js';

const HAB_ICON = { shore: '🏖️ Beach', deep: '🌊 Deep sea', pond: '🌲 Forest pond', reef: '🐢 Turtle Islet', any: '💧 Anywhere' };
const TIME_ICON = { any: '', day: '☀️ Daytime', night: '🌙 Night', dawn: '🌅 Dawn', dusk: '🌇 Sunset', rain: '🌧️ Rain or night' };
const NEED_LABEL = { coins: ['🪙', 'Coins'], anyCrop: ['🥕', 'Any crops'], anyDish: ['🍲', 'Any cooked dishes'], journal: ['📖', 'Kinds of fish discovered'], feast: ['🍱', 'Family Feast'] };

const count = (g, id) => g.session.state.basket[id] || 0;
const btn = (label, ontap, cls = '', disabled = false) => {
  const b = tapButton({ class: 'btn ' + cls, ontap }, label);
  if (disabled) b.disabled = true;
  return b;
};

async function ask(g, req, okMsg) {
  const res = await g.session.request(req);
  if (!res?.ok) {
    g.ui.toast(res?.msg || 'Hmm, that didn’t work.', '🙈');
    g.audio.ui('error');
  } else if (okMsg) {
    g.ui.toast(typeof okMsg === 'function' ? okMsg(res) : okMsg, '✨');
  }
  return res;
}

// ---------------------------------------------------------------- menu
export function menuPanel(g) {
  g.ui.openSheet({
    title: 'Menu', icon: '🏝️',
    build: (b) => {
      const tile = (ic, label, fn) => tapButton({ class: 'tile', ontap: fn }, h('span', { class: 'tile-ic' }, ic), h('span', {}, label));
      b.append(h('div', { class: 'tiles' },
        tile('🧺', 'Basket', () => g.openPanel('basket')),
        tile('📖', 'Fish Journal', () => g.openPanel('journal')),
        tile('📋', 'Family Board', () => g.openPanel('board')),
        tile('👨‍👩‍👧‍👦', 'Family & Invite', () => g.openPanel('family')),
        tile('👕', 'My Look', () => g.openPanel('look')),
        tile('⚙️', 'Settings', () => g.openPanel('settings')),
        tile('❓', 'How to Play', () => g.openPanel('help')),
        tile('📸', 'Photo', () => { g.ui.closeSheet(); g.takePhoto(); }),
        tile('🚪', 'Leave Island', () => g.openPanel('leave')),
      ));
    },
  });
}

// ---------------------------------------------------------------- basket
export function basketPanel(g) {
  g.ui.openSheet({
    title: 'Family Basket', icon: '🧺',
    build: (b) => {
      const s = g.session.state;
      b.append(h('div', { class: 'jar' }, h('span', { class: 'big' }, '🪙'), h('div', {}, h('b', {}, `${s.coins} coins`), h('small', {}, 'in the family jar'))));
      const groups = [
        ['Fish', (it) => it.kind === 'fish' || it.kind === 'junk'],
        ['Cooked food', (it) => it.kind === 'dish'],
        ['Fruit & veggies', (it) => it.kind === 'crop' || it.kind === 'food'],
        ['Treasures', (it) => it.kind === 'forage' || it.kind === 'material' || it.kind === 'special'],
        ['Seeds & bait', (it) => it.kind === 'seed' || it.kind === 'bait'],
      ];
      let any = false;
      for (const [name, test] of groups) {
        const ids = Object.keys(s.basket).filter((id) => s.basket[id] > 0 && ITEMS[id] && test(ITEMS[id]));
        if (!ids.length) continue;
        any = true;
        b.append(h('h3', {}, name));
        b.append(h('div', { class: 'grid items' }, ids.map((id) => {
          const it = ITEMS[id];
          return tapButton({ class: 'item', ontap: () => g.ui.toast(`${it.name}${it.value ? ` — worth ${it.value} coins` : ''}`, it.emoji, 1800) },
            h('span', { class: 'item-ic' }, it.kind === 'seed' ? it.cropEmoji : it.emoji), it.kind === 'seed' ? h('i', { class: 'seed-tag' }, '🌱') : null,
            h('b', { class: 'n' }, s.basket[id]), h('small', {}, it.name));
        })));
      }
      if (!any) b.append(h('p', { class: 'empty' }, 'The basket is empty. Go explore the beach! 🐚'));
    },
  });
}

// ---------------------------------------------------------------- journal
export function journalPanel(g, tab = 'fish') {
  g.ui.openSheet({
    title: 'Fish Journal', icon: '📖', cls: 'tall',
    build: (b, close) => {
      const s = g.session.state;
      const found = JOURNAL_FISH.filter((f) => s.journal[f.id]).length;
      b.append(h('div', { class: 'tabs' },
        tapButton({ class: 'tab' + (tab === 'fish' ? ' on' : ''), ontap: () => { close(); journalPanel(g, 'fish'); } }, '🐟 Fish'),
        tapButton({ class: 'tab' + (tab === 'family' ? ' on' : ''), ontap: () => { close(); journalPanel(g, 'family'); } }, '🏅 Family')));
      if (tab === 'family') {
        const st = s.stats;
        b.append(h('div', { class: 'stats' },
          stat('🐟', st.fish, 'fish caught'), stat('📖', `${found}/${JOURNAL_FISH.length}`, 'kinds found'), stat('🥕', st.crops, 'veggies grown'),
          stat('🍲', st.dishes, 'dishes cooked'), stat('🪙', st.earned, 'coins earned'), stat('🌅', st.days, 'days on the island')));
        b.append(h('h3', {}, 'Our anglers'));
        const ps = Object.values(s.players).sort((a, c) => (c.caught || 0) - (a.caught || 0));
        b.append(h('div', { class: 'list' }, ps.map((p) => h('div', { class: 'row-item' }, h('span', { class: 'face', style: { borderColor: p.look?.accent, background: p.look?.shirt } }, (p.name || '?')[0]), h('span', { class: 'grow' }, p.name), h('b', {}, `${p.caught || 0} 🐟`)))));
        return;
      }
      b.append(h('div', { class: 'progress' }, h('i', { style: { width: `${(found / JOURNAL_FISH.length) * 100}%` } }), h('span', {}, `${found} of ${JOURNAL_FISH.length} discovered`)));
      b.append(h('div', { class: 'grid fishes' }, FISH.filter((f) => !f.junk).map((f) => {
        const j = s.journal[f.id];
        const r = RARITY[f.rar];
        if (!j) {
          return tapButton({ class: 'fish-card unknown', ontap: () => g.ui.toast(`Hint: ${HAB_ICON[f.hab[0]]}${TIME_ICON[f.time] ? ' · ' + TIME_ICON[f.time] : ''}`, '🔎', 2600) },
            h('div', { class: 'art', html: fishSVG(f.id, { silhouette: true }) }), h('b', {}, '???'), h('small', {}, HAB_ICON[f.hab[0]].split(' ')[0] + ' ' + (TIME_ICON[f.time].split(' ')[0] || '')));
        }
        return tapButton({ class: 'fish-card', ontap: () => fishDetail(g, f.id) },
          h('div', { class: 'art', html: fishSVG(f.id) }), h('b', {}, f.name), h('small', { style: { color: r.color } }, '★'.repeat(r.stars)), h('small', {}, `best ${j.best} cm`));
      })));
    },
  });
}
const stat = (ic, n, label) => h('div', { class: 'stat' }, h('span', { class: 'ic' }, ic), h('b', {}, String(n)), h('small', {}, label));

function fishDetail(g, id) {
  const f = FISH_BY_ID[id], j = g.session.state.journal[id], r = RARITY[f.rar];
  g.ui.openSheet({
    title: f.name, icon: '🐟',
    build: (b) => {
      b.append(h('div', { class: 'detail-art', html: fishSVG(id) }));
      b.append(h('div', { class: 'detail' },
        h('p', { style: { color: r.color } }, '★'.repeat(r.stars) + ' ' + r.label),
        h('p', {}, `Lives: ${f.hab.map((x) => HAB_ICON[x]).join(', ')}${TIME_ICON[f.time] ? ' · ' + TIME_ICON[f.time] : ''}`),
        h('p', {}, `Caught ${j.n} time${j.n === 1 ? '' : 's'} · Biggest: ${j.best} cm`),
        h('p', {}, `First caught by ${j.by}`),
        h('p', {}, `Worth ${f.value} coins`)));
      b.append(btn('← Back to journal', () => journalPanel(g), 'ghost'));
    },
  });
}

// ---------------------------------------------------------------- family board (projects)
export function boardPanel(g, focus) {
  g.ui.openSheet({
    title: 'Family Board', icon: '📋', cls: 'tall',
    build: (b) => {
      const s = g.session.state;
      b.append(h('p', { class: 'lead' }, 'Fix up the island together! Everyone can chip in from the family basket.'));
      const avail = (p) => !p.after || p.after.every((id) => s.projects[id]?.done);
      for (const p of PROJECTS) {
        const st = s.projects[p.id] || { got: {}, done: false, by: {} };
        const card = h('div', { class: 'project' + (st.done ? ' done' : '') + (focus === p.id ? ' focus' : '') });
        card.append(h('div', { class: 'project-head' }, h('span', { class: 'project-ic' }, p.emoji), h('div', {}, h('b', {}, p.name), h('small', {}, st.done ? '✅ ' + p.reward : p.desc))));
        if (!st.done) {
          if (!avail(p)) card.append(h('p', { class: 'locked' }, '🔒 Finish the other projects first!'));
          for (const [need, total] of Object.entries(p.needs)) {
            const got = need === 'journal' ? Object.keys(s.journal).length : st.got[need] || 0;
            const [ic, label] = NEED_LABEL[need] || [ITEMS[need]?.emoji, ITEMS[need]?.name];
            const have = need === 'coins' ? s.coins : need === 'journal' ? null : need === 'anyCrop' ? Object.keys(CROPS).reduce((a, c) => a + count(g, c), 0)
              : need === 'anyDish' ? RECIPES.filter((r) => !r.special).reduce((a, r) => a + count(g, r.id), 0) : count(g, need);
            const left = Math.max(0, total - got);
            const row = h('div', { class: 'need' },
              h('span', { class: 'need-ic' }, ic),
              h('div', { class: 'need-mid' }, h('div', {}, label, ' ', h('b', {}, `${Math.min(got, total)}/${total}`)), h('div', { class: 'bar' }, h('i', { style: { width: `${Math.min(1, got / total) * 100}%` } }))),
            );
            if (need !== 'journal' && left > 0) {
              const giveN = Math.min(left, have || 0);
              row.append(btn(giveN > 0 ? `Give ${giveN}` : 'None yet', async () => {
                const res = await ask(g, { a: 'donate', p: p.id, need, n: giveN });
                if (res?.ok) { g.audio.chime(); if (!res.done) g.ui.refreshSheet(); }
              }, 'small', !avail(p) || !(giveN > 0)));
            } else if (left <= 0) row.append(h('span', { class: 'tick' }, '✓'));
            card.append(row);
          }
        }
        // who helped (one heart per helper, in their colour)
        const helpers = Object.entries(st.by || {}).filter(([, n]) => n > 0);
        if (helpers.length) {
          card.append(h('div', { class: 'helpers' }, 'Helpers: ', helpers.map(([pid]) => {
            const pl = s.players[pid];
            return h('span', { class: 'heart', style: { color: pl?.look?.accent || '#e8574a' } }, '❤ ', h('small', {}, pl?.name || ''));
          })));
        }
        b.append(card);
      }
    },
  });
}

// ---------------------------------------------------------------- shop
export function shopPanel(g, tab = 'seeds') {
  g.ui.openSheet({
    title: 'Captain Shelly’s Shop', icon: '🐢', cls: 'tall',
    build: (b, close) => {
      const s = g.session.state;
      b.append(h('div', { class: 'shop-top' }, h('span', {}, '"Ahoy, little islanders! What’ll it be?"'), h('b', {}, `🪙 ${s.coins}`)));
      b.append(h('div', { class: 'tabs' },
        tapButton({ class: 'tab' + (tab === 'seeds' ? ' on' : ''), ontap: () => { close(); shopPanel(g, 'seeds'); } }, '🌱 Seeds & Bait'),
        tapButton({ class: 'tab' + (tab === 'hats' ? ' on' : ''), ontap: () => { close(); shopPanel(g, 'hats'); } }, '🎩 Hats')));
      if (tab === 'seeds') {
        b.append(h('div', { class: 'list' }, SHOP.map((o, i) => {
          const it = ITEMS[o.item];
          const crop = it.crop ? CROPS[it.crop] : null;
          const desc = crop ? `Grows in ~${Math.round((crop.stage * 3) / 60 * 10) / 10} min · sells for ${crop.value}` : it.name === 'Shrimp Bait' ? 'Rare fish love it!' : 'Legendary fish can’t resist!';
          return h('div', { class: 'row-item' },
            h('span', { class: 'big-ic' }, crop ? crop.emoji : it.emoji),
            h('div', { class: 'grow' }, h('b', {}, `${it.name} ×${o.n}`), h('small', {}, desc)),
            btn(`🪙 ${o.price}`, async () => { const r = await ask(g, { a: 'buy', i }); if (r?.ok) { g.audio.coin(); g.ui.toast(`Bought ${it.name} ×${o.n}`, crop ? crop.emoji : it.emoji, 1500); g.ui.refreshSheet(); } }, 'small', s.coins < o.price));
        })));
      } else {
        b.append(h('p', { class: 'lead' }, 'Hats are for the whole family — buy once, everyone can wear it!'));
        b.append(h('div', { class: 'list' }, HATS.map((hat) => {
          const owned = s.hats.includes(hat.id);
          return h('div', { class: 'row-item' },
            h('span', { class: 'big-ic' }, hatEmoji(hat.id)),
            h('div', { class: 'grow' }, h('b', {}, hat.name), h('small', {}, owned ? 'Unlocked' : hat.id === 'crown' ? 'Reward for the Lantern Festival… or 600 coins' : '')),
            owned ? btn('Wear', () => wearHat(g, hat.id), 'small ghost')
              : btn(`🪙 ${hat.price}`, async () => { const r = await ask(g, { a: 'buyHat', hat: hat.id }); if (r?.ok) { g.audio.fanfare(); g.ui.refreshSheet(); } }, 'small', s.coins < hat.price));
        })));
      }
    },
  });
}

function wearHat(g, hat) {
  const look = { ...g.profile.look, hat };
  g.setLook(look);
  g.ui.toast('Looking great!', hatEmoji(hat), 1400);
}

// ---------------------------------------------------------------- sell (market crate)
export function sellPanel(g) {
  g.ui.openSheet({
    title: 'Market Crate', icon: '🪙', cls: 'tall',
    build: (b) => {
      const s = g.session.state;
      b.append(h('p', { class: 'lead' }, 'Put things in the crate and coins go into the family jar.'));
      const needed = new Set();
      for (const p of PROJECTS) if (!s.projects[p.id]?.done) for (const k of Object.keys(p.needs)) needed.add(k);
      const ids = Object.keys(s.basket).filter((id) => s.basket[id] > 0 && ITEMS[id]?.value > 0).sort((a, c) => ITEMS[a].kind.localeCompare(ITEMS[c].kind));
      if (!ids.length) { b.append(h('p', { class: 'empty' }, 'Nothing to sell yet. Catch some fish or pick up shells! 🐚')); return; }
      b.append(h('div', { class: 'list' }, ids.map((id) => {
        const it = ITEMS[id], n = s.basket[id];
        const keep = needed.has(id) || (needed.has('anyCrop') && it.kind === 'crop') || (needed.has('anyDish') && it.kind === 'dish');
        const sell = async (k) => { const r = await ask(g, { a: 'sell', item: id, n: k }); if (r?.ok) { g.audio.coin(); g.fx.label(g.players.local.x, g.players.local.y + 2, g.players.local.z, `+${r.coins} 🪙`, 'coin'); g.ui.refreshSheet(); } };
        return h('div', { class: 'row-item' },
          h('span', { class: 'big-ic' }, it.emoji),
          h('div', { class: 'grow' }, h('b', {}, `${it.name} ×${n}`), h('small', {}, `${it.value} each${keep ? ' · 📌 a project needs this' : ''}`)),
          btn('Sell 1', () => sell(1), 'small ghost'), n > 1 ? btn('All', () => sell(n), 'small') : null);
      })));
    },
  });
}

// ---------------------------------------------------------------- cooking
export function cookPanel(g) {
  g.ui.openSheet({
    title: 'Campfire Kitchen', icon: '🍳', cls: 'tall',
    build: (b) => {
      const s = g.session.state;
      b.append(h('p', { class: 'lead' }, 'Cook yummy dishes! They sell for more and help with family projects.'));
      const fishCount = Object.keys(s.basket).filter((id) => ITEMS[id]?.kind === 'fish').reduce((a, id) => a + s.basket[id], 0);
      b.append(h('div', { class: 'list' }, RECIPES.map((r) => {
        let can = true;
        const chips = Object.entries(r.needs).map(([k, n]) => {
          const have = k === 'anyFish' ? fishCount : s.basket[k] || 0;
          if (have < n) can = false;
          const ic = k === 'anyFish' ? '🐟' : ITEMS[k]?.emoji;
          return h('span', { class: 'ing' + (have >= n ? ' ok' : '') }, ic, h('b', {}, `${Math.min(have, n)}/${n}`));
        });
        return h('div', { class: 'row-item recipe' + (r.special ? ' special' : '') },
          h('span', { class: 'big-ic' }, r.emoji),
          h('div', { class: 'grow' }, h('b', {}, r.name), h('div', { class: 'ings' }, chips), h('small', {}, `sells for ${r.value}`)),
          btn('Cook', () => { g.ui.closeSheet(); g.cook(r); }, 'small', !can));
      })));
    },
  });
}

// ---------------------------------------------------------------- planting
export function plantPanel(g, plot) {
  g.ui.openSheet({
    title: 'Plant Seeds', icon: '🌱',
    build: (b, close) => {
      const s = g.session.state;
      const seeds = Object.keys(CROPS).filter((c) => (s.basket['seed:' + c] || 0) > 0);
      if (!seeds.length) {
        b.append(h('p', { class: 'empty' }, 'No seeds in the basket. Captain Shelly sells them at the shop! 🐢'));
        return;
      }
      b.append(h('div', { class: 'grid seeds' }, seeds.map((c) => tapButton({ class: 'item', ontap: async () => {
        close();
        g.players.doAction('plant', 0.7);
        const r = await ask(g, { a: 'plant', i: plot, crop: c });
        if (r?.ok) { g.audio.pop(); g.ui.toast(`Planted ${CROPS[c].name}! Don’t forget to water it 💧`, CROPS[c].emoji, 2200); g.tutorial('planted'); }
      } }, h('span', { class: 'item-ic' }, CROPS[c].emoji), h('b', { class: 'n' }, s.basket['seed:' + c]), h('small', {}, CROPS[c].name)))));
    },
  });
}

// ---------------------------------------------------------------- mail
export function letterPanel(g, letter) {
  g.ui.openSheet({
    title: 'A letter!', icon: '✉️',
    build: (b, close) => {
      const gifts = Object.entries(letter.gift).map(([k, n]) => k === 'coins' ? `🪙 ${n}` : `${ITEMS[k].kind === 'seed' ? ITEMS[k].cropEmoji : ITEMS[k].emoji} ×${n}`).join('  ');
      b.append(h('div', { class: 'letter' }, h('p', {}, letter.text), h('p', { class: 'from' }, '— ' + letter.from), h('div', { class: 'gift' }, '🎁 ', gifts)));
      b.append(btn('Thank you! 💛', close, 'primary'));
    },
  });
}

// ---------------------------------------------------------------- family & invite
export function familyPanel(g) {
  g.ui.openSheet({
    title: 'Family & Invite', icon: '👨‍👩‍👧‍👦',
    build: (b) => {
      const S = g.session;
      const code = S.code || '';
      const pretty = code.replace(/(\d+)$/, ' $1');
      b.append(h('div', { class: 'code-box' }, h('small', {}, S.isHost ? 'Our island code' : 'Island code'), h('div', { class: 'code' }, pretty)));
      if (S.isHost) {
        const st = S.transport?.status() || {};
        b.append(h('p', { class: 'lead' }, 'On another phone: open Cozy Cove → ', h('b', {}, 'Join Family'), ' → type this code. Up to 4 players can play together. Being on the same Wi-Fi works best!'));
        b.append(h('p', { class: 'net ' + (st.peer || st.trystero ? 'ok' : '') }, st.peer ? '🟢 Ready for family to join' : '🟡 Connecting to the internet… (you can still play)'));
      } else {
        b.append(h('p', { class: 'lead' }, 'You’re visiting the family island. Everything you find goes into the shared family basket!'));
      }
      b.append(h('div', { class: 'row' },
        btn('📋 Copy code', () => { navigator.clipboard?.writeText(code).then(() => g.ui.toast('Code copied!', '📋', 1200)).catch(() => {}); }, 'ghost'),
        navigator.share ? btn('💌 Share', () => navigator.share({ title: 'Cozy Cove', text: `Come play on our Cozy Cove island! Code: ${pretty}` }).catch(() => {}), 'ghost') : null));
      b.append(h('h3', {}, `On the island now (${S.online.size}/4)`));
      b.append(h('div', { class: 'list' }, [...S.online.entries()].map(([pid, o]) => h('div', { class: 'row-item' },
        h('span', { class: 'face', style: { borderColor: o.look?.accent, background: o.look?.shirt } }, (o.name || '?')[0]),
        h('span', { class: 'grow' }, o.name, pid === S.pid ? ' (you)' : ''), pid === S.pid && S.isHost ? h('small', {}, 'host 🏠') : null))));
    },
  });
}

// ---------------------------------------------------------------- my look
export function lookPanel(g) {
  g.previewLook(true);
  g.ui.openSheet({
    title: 'My Look', icon: '👕', cls: 'look',
    onClose: () => g.previewLook(false),
    build: (b, close) => {
      b.append(buildLookEditor({
        profile: g.profile,
        ownedHats: g.session.state.hats,
        onChange: (look) => g.applyPreview(look),
        onSave: (p) => { g.saveProfile(p); close(); g.ui.toast('Looking great!', hatEmoji(p.look.hat), 1400); },
        toast: (t, i) => g.ui.toast(t, i, 1800),
      }));
    },
  });
}

// ---------------------------------------------------------------- settings
export function settingsPanel(g) {
  g.ui.openSheet({
    title: 'Settings', icon: '⚙️', cls: 'tall',
    build: (b) => {
      const st = g.settings;
      b.append(h('h3', {}, 'Graphics'));
      b.append(h('p', { class: 'lead small' }, 'Lower settings keep the phone cooler and the battery happier.'));
      b.append(h('div', { class: 'seg' }, Object.entries(QUALITY).map(([k, q]) => tapButton({ class: 'seg-b' + (st.quality === k ? ' on' : ''), ontap: () => { g.setSetting('quality', k); g.ui.refreshSheet(); } }, q.label))));
      const slider = (label, key) => {
        const inp = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st[key] });
        inp.addEventListener('input', () => g.setSetting(key, Number(inp.value)));
        return h('label', { class: 'field slider' }, h('span', {}, label), inp);
      };
      b.append(h('h3', {}, 'Sound'), slider('🎵 Music', 'music'), slider('🔔 Sounds', 'sfx'));
      b.append(h('p', { class: 'lead small' }, 'No sound? Check the silent switch on the side of the iPhone.'));
      const toggle = (label, key) => {
        const el = tapButton({ class: 'toggle' + (st[key] ? ' on' : ''), ontap: () => { g.setSetting(key, !g.settings[key]); el.classList.toggle('on', g.settings[key]); } }, h('span', {}, label), h('i'));
        return el;
      };
      b.append(h('h3', {}, 'Game'), toggle('🎣 Relaxed fishing (easier)', 'relaxedFishing'), toggle('🏷️ Show names above heads', 'nameTags'), toggle('📊 Show speed (FPS)', 'showFps'));
      b.append(h('h3', {}, 'App'));
      b.append(h('div', { class: 'row' }, btn('🔄 Check for update', () => g.checkUpdate(), 'ghost')));
      if (g.session.isHost) {
        b.append(btn('🗑️ Start a brand-new island…', () => {
          if (confirm('Start over with a brand-new island? Everything on this island will be gone.') && confirm('Are you really sure? This can’t be undone.')) g.resetIsland();
        }, 'danger small'));
      }
      b.append(h('p', { class: 'about' }, 'Cozy Cove · made with love for families 💛'));
    },
  });
}

// ---------------------------------------------------------------- help
export function helpPanel(g) {
  g.ui.openSheet({
    title: 'How to Play', icon: '❓', cls: 'tall',
    build: (b) => {
      const tip = (ic, title, text) => h('div', { class: 'tip' }, h('span', { class: 'big-ic' }, ic), h('div', {}, h('b', {}, title), h('p', {}, text)));
      b.append(
        tip('👆', 'Walk', 'Put your thumb anywhere on the island and slide it. Push further to run.'),
        tip('🔘', 'The big button', 'It changes depending on what’s near you: pick up, shake trees, plant, water, shop, cook…'),
        tip('🎣', 'Fishing', 'Face the water and HOLD the button, let go to cast. When the bobber dips — tap! Then hold to reel, and let go when the fish splashes.'),
        tip('🌱', 'Garden', 'Plant seeds by the cottage, water them, and harvest when they sparkle. Rain waters them for you!'),
        tip('🍳', 'Cooking', 'Visit the campfire to turn fish, fruit and veggies into yummy dishes.'),
        tip('📋', 'Family Board', 'Work together to fix the bridge, light the lighthouse and throw a Lantern Festival!'),
        tip('🧺', 'Shared basket', 'Everything anyone finds goes into ONE family basket. Coins go into the family jar.'),
        tip('👨‍👩‍👧‍👦', 'Play together', 'One phone taps "Play on our island". Others tap "Join Family" and type the island code. Up to 4 players!'),
        tip('✉️', 'Every day', 'Check the mailbox each morning for a gift, and dig for treasure on Turtle Islet!'),
      );
    },
  });
}

export function leavePanel(g) {
  g.ui.openSheet({
    title: 'Leave the island?', icon: '🚪',
    build: (b, close) => {
      b.append(h('p', { class: 'lead' }, g.session.isHost ? 'Your island is saved on this phone. If family members are playing, they’ll be sent back to the menu.' : 'You can come back any time with the island code.'));
      b.append(h('div', { class: 'row' }, btn('Stay', close, 'ghost'), btn('Leave', () => { close(); g.leave(); }, 'primary')));
    },
  });
}

export const PANELS = {
  menu: menuPanel, basket: basketPanel, journal: journalPanel, board: boardPanel, shop: shopPanel, sell: sellPanel, cook: cookPanel,
  family: familyPanel, look: lookPanel, settings: settingsPanel, help: helpPanel, leave: leavePanel,
};
export { PROJECT_BY_ID };
