// What's inside each pop-up panel (basket, journal, family board, shop, cooking…).
import { h, tapButton, firstLetter, focusAfterTap } from './dom.js';
import { ITEMS, FISH, FISH_BY_ID, JOURNAL_FISH, RARITY, CROPS, RECIPES, SHOP, PROJECTS, PROJECT_BY_ID, STICKERS } from '../game/data.js';
import { HATS } from '../entities/character.js';
import { buildLookEditor, hatEmoji } from './lookeditor.js';
import { prettyCode } from './screens.js';
import { splitCode } from '../net/transport.js';
import { fishSVG } from './fishart.js';
import { QUALITY } from '../render/renderer.js';
import { canSpeak, speak, stopSpeaking } from '../audio/speech.js';
import { t, tr, N_, islandName, LANGS, getLang, versionText } from '../i18n/i18n.js';
import { limitLetters } from '../util/text.js';

// English labels (the keys); they are translated with t() where they are shown.
const HAB_ICON = { shore: '🏖️ Beach', deep: '🌊 Deep sea', pond: '🌲 Forest pond', reef: '🐢 Turtle Islet', any: '💧 Anywhere' };
const TIME_ICON = { any: '', day: '☀️ Daytime', night: '🌙 Night', dawn: '🌅 Dawn', dusk: '🌇 Sunset', rain: '🌧️ Rain or night' };
const NEED_LABEL = { coins: ['🪙', 'Coins'], anyCrop: ['🥕', 'Any crops'], anyDish: ['🍲', 'Any cooked dishes'], journal: ['📖', 'Kinds of fish discovered'], feast: ['🍱', 'Family Feast'] };

const REQ_LABEL = { anyFish: ['🐟', 'Any fish'], anyDish: ['🍲', 'Any cooked dish'], anyCrop: ['🥕', 'Any veggies'] };

const count = (g, id) => g.session.state.basket[id] || 0;
// how many basket items count towards Shelly's request (same rule as the host uses)
function requestHave(s, need) {
  const b = s.basket;
  let ids;
  if (need === 'anyFish') ids = Object.keys(b).filter((id) => ITEMS[id]?.kind === 'fish');
  else if (need === 'anyDish') ids = RECIPES.filter((r) => !r.special).map((r) => r.id);
  else if (need === 'anyCrop') ids = Object.keys(CROPS);
  else ids = [need];
  return ids.reduce((a, id) => a + (b[id] || 0), 0);
}
const btn = (label, ontap, cls = '', disabled = false) => {
  const b = tapButton({ class: 'btn ' + cls, ontap }, label);
  if (disabled) b.disabled = true;
  return b;
};

async function ask(g, req, okMsg) {
  const res = await g.session.request(req);
  if (!res?.ok) {
    g.ui.toast(tr(res?.msg) || t('Hmm, that didn’t work.'), '🙈');
    g.audio.ui('error');
  } else if (okMsg) {
    g.ui.toast(typeof okMsg === 'function' ? okMsg(res) : okMsg, '✨');
  }
  return res;
}

// where a fish lives, e.g. "🏖️ Beach · ☀️ Daytime" (in this phone's language)
const timeText = (f) => (TIME_ICON[f.time] ? ' · ' + t(TIME_ICON[f.time]) : '');

// ---------------------------------------------------------------- menu
export function menuPanel(g) {
  g.ui.openSheet({
    title: () => t('Menu'), icon: '🏝️',
    build: (b) => {
      const other = LANGS.find((L) => L.id !== getLang());
      b.append(h('div', { class: 'menu-lang' }, tapButton({ class: 'lang-pill', ontap: () => g.changeLang(other.id) }, `${other.flag} ${other.label}`)));
      const tile = (ic, label, fn) => tapButton({ class: 'tile', ontap: fn }, h('span', { class: 'tile-ic' }, ic), h('span', {}, label));
      b.append(h('div', { class: 'tiles' },
        tile('🧺', t('Basket'), () => g.openPanel('basket')),
        tile('📖', t('Fish Journal'), () => g.openPanel('journal')),
        tile('📋', t('Family Board'), () => g.openPanel('board')),
        tile('👨‍👩‍👧‍👦', t('Family & Invite'), () => g.openPanel('family')),
        tile('👕', t('My Look'), () => g.openPanel('look')),
        tile('⚙️', t('Settings'), () => g.openPanel('settings')),
        tile('❓', t('How to Play'), () => g.openPanel('help')),
        tile('📸', t('Photo'), () => { g.ui.closeSheet(); g.takePhoto(); }),
        tile('🏠', t('Start Screen'), () => g.openPanel('leave')),
      ));
    },
  });
}

// ---------------------------------------------------------------- basket
export function basketPanel(g) {
  g.ui.openSheet({
    title: () => t('Family Basket'), icon: '🧺',
    build: (b) => {
      const s = g.session.state;
      b.append(h('div', { class: 'jar' }, h('span', { class: 'big' }, '🪙'), h('div', {}, h('b', {}, t('{n} coins', { n: s.coins })), h('small', {}, t('in the family jar')))));
      const groups = [
        [t('Fish'), (it) => it.kind === 'fish' || it.kind === 'junk'],
        [t('Cooked food'), (it) => it.kind === 'dish'],
        [t('Fruit & veggies'), (it) => it.kind === 'crop' || it.kind === 'food'],
        [t('Treasures'), (it) => it.kind === 'forage' || it.kind === 'material' || it.kind === 'special'],
        [t('Seeds & bait'), (it) => it.kind === 'seed' || it.kind === 'bait'],
      ];
      let any = false;
      for (const [name, test] of groups) {
        const ids = Object.keys(s.basket).filter((id) => s.basket[id] > 0 && ITEMS[id] && test(ITEMS[id]));
        if (!ids.length) continue;
        any = true;
        b.append(h('h3', {}, name));
        b.append(h('div', { class: 'grid items' }, ids.map((id) => {
          const it = ITEMS[id];
          return tapButton({ class: 'item', ontap: () => g.ui.toast(it.value ? t('{name} — worth {n} coins', { name: t(it.name), n: it.value }) : t(it.name), it.emoji, 1800) },
            h('span', { class: 'item-ic' }, it.kind === 'seed' ? it.cropEmoji : it.emoji), it.kind === 'seed' ? h('i', { class: 'seed-tag' }, '🌱') : null,
            h('b', { class: 'n' }, s.basket[id]), h('small', {}, t(it.name)));
        })));
      }
      if (!any) b.append(h('p', { class: 'empty' }, t('The basket is empty. Go explore the beach! 🐚')));
    },
  });
}

// ---------------------------------------------------------------- journal
export function journalPanel(g, tab = 'fish') {
  g.ui.openSheet({
    title: () => t('Fish Journal'), icon: '📖', cls: 'tall',
    build: (b, close) => {
      const s = g.session.state;
      const found = JOURNAL_FISH.filter((f) => s.journal[f.id]).length;
      b.append(h('div', { class: 'tabs' },
        tapButton({ class: 'tab' + (tab === 'fish' ? ' on' : ''), ontap: () => { close(); journalPanel(g, 'fish'); } }, t('🐟 Fish')),
        tapButton({ class: 'tab' + (tab === 'stickers' ? ' on' : ''), ontap: () => { close(); journalPanel(g, 'stickers'); } }, t('🏅 Stickers')),
        tapButton({ class: 'tab' + (tab === 'family' ? ' on' : ''), ontap: () => { close(); journalPanel(g, 'family'); } }, t('📊 Family'))));
      if (tab === 'stickers') {
        const got = new Set(s.stickers || []);
        b.append(h('div', { class: 'progress' }, h('i', { style: { width: `${(got.size / STICKERS.length) * 100}%` } }), h('span', {}, t('{n} of {total} stickers', { n: got.size, total: STICKERS.length }))));
        b.append(h('div', { class: 'grid stickers' }, STICKERS.map((st) => {
          const has = got.has(st.id);
          return tapButton({ class: 'sticker' + (has ? ' got' : ''), ontap: () => g.ui.toast(has ? t('{name}: {hint}!', { name: t(st.name), hint: t(st.hint) }) : t('To earn it: {hint}', { hint: t(st.hint) }), has ? st.emoji : '🔒', 2000) },
            h('span', { class: 'sticker-ic' }, has ? st.emoji : '❔'), h('small', {}, has ? t(st.name) : t(st.hint)));
        })));
        return;
      }
      if (tab === 'family') {
        const st = s.stats;
        b.append(h('div', { class: 'stats' },
          stat('🐟', st.fish, t('fish caught')), stat('📖', `${found}/${JOURNAL_FISH.length}`, t('kinds found')), stat('🥕', st.crops, t('veggies grown')),
          stat('🍲', st.dishes, t('dishes cooked')), stat('🪙', st.earned, t('coins earned')), stat('🌅', st.days, t('days on the island'))));
        b.append(h('h3', {}, t('Our anglers')));
        const ps = Object.values(s.players).sort((a, c) => (c.caught || 0) - (a.caught || 0));
        b.append(h('div', { class: 'list' }, ps.map((p) => h('div', { class: 'row-item' }, h('span', { class: 'face', style: { borderColor: p.look?.accent, background: p.look?.shirt } }, firstLetter(p.name)), h('span', { class: 'grow' }, p.name), h('b', {}, `${p.caught || 0} 🐟`)))));
        return;
      }
      b.append(h('div', { class: 'progress' }, h('i', { style: { width: `${(found / JOURNAL_FISH.length) * 100}%` } }), h('span', {}, t('{n} of {total} discovered', { n: found, total: JOURNAL_FISH.length }))));
      b.append(h('div', { class: 'grid fishes' }, FISH.filter((f) => !f.junk).map((f) => {
        const j = s.journal[f.id];
        const r = RARITY[f.rar];
        if (!j) {
          return tapButton({ class: 'fish-card unknown', ontap: () => g.ui.toast(t('Hint: {where}', { where: t(HAB_ICON[f.hab[0]]) + timeText(f) }), '🔎', 2600) },
            h('div', { class: 'art', html: fishSVG(f.id, { silhouette: true }) }), h('b', {}, '???'), h('small', {}, HAB_ICON[f.hab[0]].split(' ')[0] + ' ' + (TIME_ICON[f.time].split(' ')[0] || '')));
        }
        return tapButton({ class: 'fish-card', ontap: () => fishDetail(g, f.id) },
          h('div', { class: 'art', html: fishSVG(f.id) }), h('b', {}, t(f.name)), h('small', { style: { color: r.color } }, '★'.repeat(r.stars)), h('small', {}, t('best {n} cm', { n: j.best })));
      })));
    },
  });
}
const stat = (ic, n, label) => h('div', { class: 'stat' }, h('span', { class: 'ic' }, ic), h('b', {}, String(n)), h('small', {}, label));

function fishDetail(g, id) {
  const f = FISH_BY_ID[id], j = g.session.state.journal[id], r = RARITY[f.rar];
  g.ui.openSheet({
    title: () => t(f.name), icon: '🐟',
    build: (b) => {
      b.append(h('div', { class: 'detail-art', html: fishSVG(id) }));
      b.append(h('div', { class: 'detail' },
        h('p', { style: { color: r.color } }, '★'.repeat(r.stars) + ' ' + t(r.label)),
        h('p', {}, t('Lives: {where}', { where: f.hab.map((x) => t(HAB_ICON[x])).join(', ') + timeText(f) })),
        h('p', {}, j.n === 1 ? t('Caught {n} time · Biggest: {size} cm', { n: j.n, size: j.best }) : t('Caught {n} times · Biggest: {size} cm', { n: j.n, size: j.best })),
        h('p', {}, t('First caught by {name}', { name: j.by === 'Someone' ? t('Someone') : j.by })), // (the host stores 'Someone' when a player has no name)
        h('p', {}, t('Worth {n} coins', { n: f.value }))));
      b.append(btn(t('← Back to journal'), () => journalPanel(g), 'ghost'));
    },
  });
}

// ---------------------------------------------------------------- family board (projects)
export function boardPanel(g, focus) {
  g.ui.openSheet({
    title: () => t('Family Board'), icon: '📋', cls: 'tall',
    build: (b) => {
      const s = g.session.state;
      b.append(h('p', { class: 'lead' }, t('Fix up the island together! Everyone can chip in from the family basket.')));
      const avail = (p) => !p.after || p.after.every((id) => s.projects[id]?.done);
      for (const p of PROJECTS) {
        const st = s.projects[p.id] || { got: {}, done: false, by: {} };
        const card = h('div', { class: 'project' + (st.done ? ' done' : '') + (focus === p.id ? ' focus' : '') });
        card.append(h('div', { class: 'project-head' }, h('span', { class: 'project-ic' }, p.emoji), h('div', {}, h('b', {}, t(p.name)), h('small', {}, st.done ? '✅ ' + t(p.reward) : t(p.desc)))));
        if (!st.done) {
          if (!avail(p)) card.append(h('p', { class: 'locked' }, t('🔒 Finish the other projects first!')));
          for (const [need, total] of Object.entries(p.needs)) {
            const got = need === 'journal' ? Object.keys(s.journal).length : st.got[need] || 0;
            const [ic, label] = NEED_LABEL[need] || [ITEMS[need]?.emoji, ITEMS[need]?.name];
            const have = need === 'coins' ? s.coins : need === 'journal' ? null : need === 'anyCrop' ? Object.keys(CROPS).reduce((a, c) => a + count(g, c), 0)
              : need === 'anyDish' ? RECIPES.filter((r) => !r.special).reduce((a, r) => a + count(g, r.id), 0) : count(g, need);
            const left = Math.max(0, total - got);
            const row = h('div', { class: 'need' },
              h('span', { class: 'need-ic' }, ic),
              h('div', { class: 'need-mid' }, h('div', {}, t(label), ' ', h('b', {}, `${Math.min(got, total)}/${total}`)), h('div', { class: 'bar' }, h('i', { style: { width: `${Math.min(1, got / total) * 100}%` } }))),
            );
            if (need !== 'journal' && left > 0) {
              const giveN = Math.min(left, have || 0);
              row.append(btn(giveN > 0 ? t('Give {n}', { n: giveN }) : t('None yet'), async () => {
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
          card.append(h('div', { class: 'helpers' }, t('Helpers: '), helpers.map(([pid]) => {
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
    title: () => t('Captain Shelly’s Shop'), icon: '🐢', cls: 'tall',
    build: (b, close) => {
      const s = g.session.state;
      b.append(h('div', { class: 'shop-top' }, h('span', {}, t('"Ahoy, little islanders! What’ll it be?"')), h('b', {}, `🪙 ${s.coins}`)));
      const rq = s.request;
      if (rq) {
        const [ric, rname] = REQ_LABEL[rq.item] || [ITEMS[rq.item]?.emoji || '🎁', ITEMS[rq.item]?.name || rq.item];
        const have = requestHave(s, rq.item);
        const bonus = rq.bonus ? ` + ${ITEMS[rq.bonus]?.emoji || '🎁'} ${t(ITEMS[rq.bonus]?.name || '')}` : '';
        b.append(h('div', { class: 'request' + (rq.done ? ' done' : '') },
          h('span', { class: 'big-ic' }, rq.done ? '💚' : ric),
          h('div', { class: 'grow' },
            h('b', {}, rq.done ? t('Thank you, family!') : t('Today: {name} ×{n}', { name: t(rname), n: rq.n })),
            h('small', {}, rq.done ? t('Shelly will have a new request tomorrow.') : t('You have {have}/{n} · reward 🪙 {reward}{bonus}', { have: Math.min(have, rq.n), n: rq.n, reward: rq.reward, bonus }))),
          rq.done ? null : btn(t('Give'), async () => {
            const r = await ask(g, { a: 'request' });
            if (r?.ok) { g.audio.fanfare(); g.ui.toast(t('Thank you! +{n} coins', { n: r.reward }), '🐢', 2200); g.ui.refreshSheet(); }
          }, 'small primary', have < rq.n)));
      }
      b.append(h('div', { class: 'tabs' },
        tapButton({ class: 'tab' + (tab === 'seeds' ? ' on' : ''), ontap: () => { close(); shopPanel(g, 'seeds'); } }, t('🌱 Seeds & Bait')),
        tapButton({ class: 'tab' + (tab === 'hats' ? ' on' : ''), ontap: () => { close(); shopPanel(g, 'hats'); } }, t('🎩 Hats'))));
      if (tab === 'seeds') {
        b.append(h('div', { class: 'list' }, SHOP.map((o, i) => {
          const it = ITEMS[o.item];
          const crop = it.crop ? CROPS[it.crop] : null;
          const desc = crop ? t('Grows in ~{min} min · sells for {n}', { min: Math.round((crop.stage * 3) / 60 * 10) / 10, n: crop.value }) : it.name === 'Shrimp Bait' ? t('Rare fish love it!') : t('Legendary fish can’t resist!');
          return h('div', { class: 'row-item' },
            h('span', { class: 'big-ic' }, crop ? crop.emoji : it.emoji),
            h('div', { class: 'grow' }, h('b', {}, `${t(it.name)} ×${o.n}`), h('small', {}, desc)),
            btn(`🪙 ${o.price}`, async () => { const r = await ask(g, { a: 'buy', i }); if (r?.ok) { g.audio.coin(); g.ui.toast(t('Bought {name} ×{n}', { name: t(it.name), n: o.n }), crop ? crop.emoji : it.emoji, 1500); g.ui.refreshSheet(); } }, 'small', s.coins < o.price));
        })));
      } else {
        b.append(h('p', { class: 'lead' }, t('Hats are for the whole family — buy once, everyone can wear it!')));
        b.append(h('div', { class: 'list' }, HATS.map((hat) => {
          const owned = s.hats.includes(hat.id);
          return h('div', { class: 'row-item' },
            h('span', { class: 'big-ic' }, hatEmoji(hat.id)),
            h('div', { class: 'grow' }, h('b', {}, t(hat.name)), h('small', {}, owned ? t('Unlocked') : hat.id === 'crown' ? t('Reward for the Lantern Festival… or 600 coins') : '')),
            owned ? btn(t('Wear'), () => wearHat(g, hat.id), 'small ghost')
              : btn(`🪙 ${hat.price}`, async () => { const r = await ask(g, { a: 'buyHat', hat: hat.id }); if (r?.ok) { g.audio.fanfare(); g.ui.refreshSheet(); } }, 'small', s.coins < hat.price));
        })));
      }
    },
  });
}

function wearHat(g, hat) {
  const look = { ...g.profile.look, hat };
  g.setLook(look);
  g.ui.toast(t('Looking great!'), hatEmoji(hat), 1400);
}

// ---------------------------------------------------------------- sell (market crate)
export function sellPanel(g) {
  g.ui.openSheet({
    title: () => t('Market Crate'), icon: '🪙', cls: 'tall',
    build: (b) => {
      const s = g.session.state;
      b.append(h('p', { class: 'lead' }, t('Put things in the crate and coins go into the family jar.')));
      const needed = new Set();
      for (const p of PROJECTS) if (!s.projects[p.id]?.done) for (const k of Object.keys(p.needs)) needed.add(k);
      const ids = Object.keys(s.basket).filter((id) => s.basket[id] > 0 && ITEMS[id]?.value > 0).sort((a, c) => ITEMS[a].kind.localeCompare(ITEMS[c].kind));
      if (!ids.length) { b.append(h('p', { class: 'empty' }, t('Nothing to sell yet. Catch some fish or pick up shells! 🐚'))); return; }
      b.append(h('div', { class: 'list' }, ids.map((id) => {
        const it = ITEMS[id], n = s.basket[id];
        const keep = needed.has(id) || (needed.has('anyCrop') && it.kind === 'crop') || (needed.has('anyDish') && it.kind === 'dish');
        const sell = async (k) => { const r = await ask(g, { a: 'sell', item: id, n: k }); if (r?.ok) { g.audio.coin(); g.fx.label(g.players.local.x, g.players.local.y + 2, g.players.local.z, `+${r.coins} 🪙`, 'coin'); g.ui.refreshSheet(); } };
        return h('div', { class: 'row-item' },
          h('span', { class: 'big-ic' }, it.emoji),
          h('div', { class: 'grow' }, h('b', {}, `${t(it.name)} ×${n}`), h('small', {}, keep ? t('{n} each · 📌 a project needs this', { n: it.value }) : t('{n} each', { n: it.value }))),
          btn(t('Sell 1'), () => sell(1), 'small ghost'), n > 1 ? btn(t('All'), () => sell(n), 'small') : null);
      })));
    },
  });
}

// ---------------------------------------------------------------- cooking
export function cookPanel(g) {
  g.ui.openSheet({
    title: () => t('Campfire Kitchen'), icon: '🍳', cls: 'tall',
    build: (b) => {
      const s = g.session.state;
      b.append(h('p', { class: 'lead' }, t('Cook yummy dishes! They sell for more and help with family projects.')));
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
          h('div', { class: 'grow' }, h('b', {}, t(r.name)), h('div', { class: 'ings' }, chips), h('small', {}, t('sells for {n}', { n: r.value }))),
          btn(t('Cook'), () => { g.ui.closeSheet(); g.cook(r); }, 'small', !can));
      })));
    },
  });
}

// ---------------------------------------------------------------- planting
export function plantPanel(g, plot) {
  g.ui.openSheet({
    title: () => t('Plant Seeds'), icon: '🌱',
    build: (b, close) => {
      const s = g.session.state;
      const seeds = Object.keys(CROPS).filter((c) => (s.basket['seed:' + c] || 0) > 0);
      if (!seeds.length) {
        b.append(h('p', { class: 'empty' }, t('No seeds in the basket. Captain Shelly sells them at the shop! 🐢')));
        return;
      }
      b.append(h('div', { class: 'grid seeds' }, seeds.map((c) => tapButton({ class: 'item', ontap: async () => {
        close();
        g.players.doAction('plant', 0.7);
        const r = await ask(g, { a: 'plant', i: plot, crop: c });
        if (r?.ok) { g.audio.pop(); g.ui.toast(t('Planted {name}! Don’t forget to water it 💧', { name: t(CROPS[c].name) }), CROPS[c].emoji, 2200); g.tutorial('planted'); }
      } }, h('span', { class: 'item-ic' }, CROPS[c].emoji), h('b', { class: 'n' }, s.basket['seed:' + c]), h('small', {}, t(CROPS[c].name))))));
    },
  });
}

// ---------------------------------------------------------------- mail
export function letterPanel(g, letter) {
  g.ui.openSheet({
    title: () => t('A letter!'), icon: '✉️',
    onClose: stopSpeaking,
    build: (b, close) => {
      const gifts = Object.entries(letter.gift).map(([k, n]) => k === 'coins' ? `🪙 ${n}` : `${ITEMS[k].kind === 'seed' ? ITEMS[k].cropEmoji : ITEMS[k].emoji} ×${n}`).join('  ');
      b.append(h('div', { class: 'letter' }, h('p', {}, tr(letter.text)), h('p', { class: 'from' }, '— ' + tr(letter.from)), h('div', { class: 'gift' }, '🎁 ', gifts)));
      b.append(h('div', { class: 'row' },
        canSpeak() ? btn(t('🔊 Read to me'), () => speak(`${tr(letter.text)} … ${tr(letter.from)}`), 'ghost') : null,
        btn(t('Thank you! 💛'), close, 'primary')));
    },
  });
}

// ---------------------------------------------------------------- family & invite
// what the status line on the family page says (see Session.netState)
const NET_LINE = {
  online: N_('🟢 Ready: family members can join'),
  together: N_('🟢 Playing together'),
  finding: N_('🟡 Finding your family…'),
  offline: N_('🟡 Connecting to the internet… (you can still play)'),
  update: N_('📲 A family member’s phone has a different version. Update both phones to play together.'),
  alone: N_('🏝️ Playing on this phone. Everything joins up with the family later.'),
};
export function familyPanel(g) {
  let renaming = false; // typing a new island name (the page is not redrawn meanwhile)
  g.ui.openSheet({
    title: () => t('Family & Invite'), icon: '👨‍👩‍👧‍👦', keep: () => renaming,
    build: (b) => {
      const S = g.session;
      const code = S.code || '';
      const pretty = prettyCode(code);
      const sc = splitCode(code);
      b.append(h('div', { class: 'code-box' }, h('div', { class: 'island-name' }, '🏝️ ', islandName(S.state.name)), h('small', {}, t('Our island code')),
        h('div', { class: 'code' }, sc?.pic ? h('span', { class: 'code-pic' }, sc.pic) : null, sc ? h('span', {}, sc.word, ' ', h('b', {}, sc.num)) : code)));
      // the island belongs to the whole family: anyone may name it
      if (!renaming) {
        b.append(h('div', { class: 'row' }, btn(t('✏️ Name our island'), () => {
          renaming = true;
          g.ui.refreshSheet();
          focusAfterTap(b.querySelector('.rename-input'));
        }, 'small ghost')));
      } else {
        // typed right here on the page (a phone pop-up box would pause the game for everyone while it is open)
        const shown = islandName(S.state.name);
        const inp = h('input', { class: 'name-input rename-input', maxlength: 80, value: shown, autocomplete: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'done' });
        limitLetters(inp, 24); // (the island keeps up to 24 letters)
        const done = async (save) => {
          if (!renaming) return;
          renaming = false;
          const name = inp.value.trim();
          // left as the (translated) default name: keep the island's real name
          if (save && name && name !== shown) await ask(g, { a: 'rename', name });
          if (g.ui.sheet?.body === b) g.ui.refreshSheet();
        };
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); });
        b.append(h('label', { class: 'field' }, h('span', {}, t('What should your island be called?')), inp));
        b.append(h('div', { class: 'row' }, btn(t('Cancel'), () => done(false), 'small ghost'), btn(t('Save'), () => done(true), 'small primary')));
      }
      const net = S.netState();
      b.append(h('p', { class: 'net ' + (net === 'online' ? 'ok' : '') }, t(NET_LINE[net === 'online' && S.online.size > 1 ? 'together' : net] || NET_LINE.finding)));
      b.append(h('p', { class: 'lead' }, t('On another phone: open Cozy Cove → '), h('b', {}, t('Join your family')), t(' → tap this picture and type its numbers.')));
      b.append(h('div', { class: 'row' },
        btn(t('📋 Copy code'), () => { navigator.clipboard?.writeText(code).then(() => g.ui.toast(t('Code copied!'), '📋', 1200)).catch(() => {}); }, 'ghost'),
        navigator.share ? btn(t('💌 Share'), () => navigator.share({ title: 'Cozy Cove', text: t('Come play on our Cozy Cove island! Code: {code}', { code: pretty }) }).catch(() => {}), 'ghost') : null));
      const face = (o) => h('span', { class: 'face', style: { borderColor: o.look?.accent, background: o.look?.shirt } }, firstLetter(o.name));
      b.append(h('h3', {}, t('On the island now ({n}/4)', { n: S.online.size })));
      b.append(h('div', { class: 'list' }, [...S.online.entries()].map(([pid, o]) => h('div', { class: 'row-item' }, face(o),
        h('span', { class: 'grow' }, o.name, pid === S.pid ? t(' (you)') : '')))));
      // everyone else who lives here plays on their own phone whenever they like
      const away = S.members().filter((m) => !S.online.has(m.pid));
      if (away.length) {
        b.append(h('h3', {}, t('Also lives here')));
        b.append(h('div', { class: 'list' }, away.map((m) => h('div', { class: 'row-item' }, face(m), h('span', { class: 'grow' }, m.name)))));
      }
      b.append(h('p', { class: 'lead small' }, t('The island belongs to the whole family: every family member’s phone keeps it, so anyone can play any time. When you play at the same time, you play together (up to 4).')));
    },
  });
}

// ---------------------------------------------------------------- my look
export function lookPanel(g) {
  g.previewLook(true);
  g.ui.openSheet({
    title: () => t('My Look'), icon: '👕', cls: 'look', keep: true,
    onClose: () => g.previewLook(false),
    build: (b, close) => {
      b.append(buildLookEditor({
        profile: g.profile,
        ownedHats: g.session.state.hats,
        onChange: (look) => g.applyPreview(look),
        onSave: (p) => { g.saveProfile(p); close(); g.ui.toast(t('Looking great!'), hatEmoji(p.look.hat), 1400); },
        toast: (msg, i) => g.ui.toast(msg, i, 1800),
      }));
    },
  });
}

// ---------------------------------------------------------------- settings
export function settingsPanel(g) {
  g.ui.openSheet({
    title: () => t('Settings'), icon: '⚙️', cls: 'tall', keep: true,
    build: (b) => {
      const st = g.settings;
      // language: each button shows its own name ("🇹🇭 ภาษาไทย"), so anyone can find theirs
      const cur = getLang();
      b.append(h('h3', {}, t('Language')));
      b.append(h('div', { class: 'seg' }, LANGS.map((L) => tapButton({ class: 'seg-b lang' + (cur === L.id ? ' on' : ''), ontap: () => {
        if (L.id !== getLang()) g.changeLang(L.id); // the whole screen, this page too, switches at once
      } }, `${L.flag} ${L.label}`))));
      b.append(h('h3', {}, t('Graphics')));
      b.append(h('p', { class: 'lead small' }, t('Lower settings keep the phone cooler and the battery happier.')));
      b.append(h('div', { class: 'seg' }, Object.entries(QUALITY).map(([k, q]) => tapButton({ class: 'seg-b' + (st.quality === k ? ' on' : ''), ontap: () => { g.setSetting('quality', k); g.ui.refreshSheet(); } }, t(q.label)))));
      // the heat guard is holding "Extra smooth" at 30 for now: say so (it goes back to 60 by itself)
      if (g.R.state.guard && g.R.state.preset.fps > 30) b.append(h('p', { class: 'lead small' }, t('🌡️ Running at 30 fps for now, to keep the phone cool. It goes back to 60 by itself.')));
      const slider = (label, key) => {
        const inp = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: st[key] });
        inp.addEventListener('input', () => g.setSetting(key, Number(inp.value)));
        return h('label', { class: 'field slider' }, h('span', {}, label), inp);
      };
      b.append(h('h3', {}, t('Sound')), slider(t('🎵 Music'), 'music'), slider(t('🔔 Sounds'), 'sfx'));
      b.append(h('p', { class: 'lead small' }, t('No sound? Check the silent switch on the side of the iPhone.')));
      const toggle = (label, key) => {
        const el = tapButton({ class: 'toggle' + (st[key] ? ' on' : ''), ontap: () => { g.setSetting(key, !g.settings[key]); el.classList.toggle('on', g.settings[key]); } }, h('span', {}, label), h('i'));
        return el;
      };
      b.append(h('h3', {}, t('Game')), toggle(t('🎣 Relaxed fishing (easier)'), 'relaxedFishing'), toggle(t('🏷️ Show names above heads'), 'nameTags'), toggle(t('📊 Show speed (FPS)'), 'showFps'));
      b.append(h('h3', {}, t('App')));
      b.append(h('div', { class: 'row' }, btn(t('🔄 Check for update'), () => g.checkUpdate(), 'ghost')));
      b.append(btn(t('🧳 Move out of this family island…'), () => moveOutPanel(g), 'danger small'));
      b.append(h('p', { class: 'about' }, t('Cozy Cove · made with love for families 💛')));
      b.append(h('p', { class: 'about small' }, t('Version: {when}', { when: versionText() })));
    },
  });
}

// ---------------------------------------------------------------- help
export function helpPanel(g) {
  g.ui.openSheet({
    title: () => t('How to Play'), icon: '❓', cls: 'tall',
    build: (b) => {
      const tip = (ic, title, text) => h('div', { class: 'tip' }, h('span', { class: 'big-ic' }, ic), h('div', {}, h('b', {}, title), h('p', {}, text)));
      b.append(
        tip('👆', t('Walk'), t('Put your thumb anywhere on the island and slide it. Push further to run.')),
        tip('🔘', t('The big button'), t('It changes depending on what’s near you: pick up, shake trees, plant, water, shop, cook…')),
        tip('🎣', t('Fishing'), t('Face the water and HOLD the button, let go to cast. When the bobber dips — tap! Then hold to reel, and let go when the fish splashes.')),
        tip('🌱', t('Garden'), t('Plant seeds by the cottage, water them, and harvest when they sparkle. Rain waters them for you!')),
        tip('🍳', t('Cooking'), t('Visit the campfire to turn fish, fruit and veggies into yummy dishes.')),
        tip('📋', t('Family Board'), t('Work together to fix the bridge, light the lighthouse and throw a Lantern Festival!')),
        tip('🧺', t('Shared basket'), t('Everything anyone finds goes into ONE family basket. Coins go into the family jar.')),
        tip('👨‍👩‍👧‍👦', t('Play together'), t('The island belongs to the whole family. On a new phone, tap “Join your family”, tap the island’s picture and type its 3 numbers. After that, anyone can play any time; when you play at the same time, you play together (up to 4).')),
        tip('✉️', t('Every day'), t('Check the mailbox each morning for a gift, and dig for treasure on Turtle Islet!')),
        tip('🌐', t('Language'), t('Tap 🇹🇭 ภาษาไทย / 🇬🇧 English at the top of the menu ☰. Every phone can use its own language.')),
        tip('🔊', t('Read to me'), t('Letters and messages in bottles have a 🔊 button: the phone reads them out loud.')),
      );
    },
  });
}

export function leavePanel(g) {
  g.ui.openSheet({
    title: () => t('Back to the start screen?'), icon: '🏠',
    build: (b, close) => {
      b.append(h('p', { class: 'lead' }, t('The island stays on this phone, and your family can keep playing. Come back any time!')));
      b.append(h('div', { class: 'row' }, btn(t('Stay'), close, 'ghost'), btn(t('🏠 Start screen'), () => { close(); g.leave(); }, 'primary')));
    },
  });
}

// "Move out of this family island" (Settings): a second page to be sure. Nothing is thrown away.
function moveOutPanel(g) {
  g.ui.openSheet({
    title: () => t('Move out of this island?'), icon: '🧳',
    build: (b, close) => {
      b.append(h('p', { class: 'lead' }, t('You’ll go back to the start screen, where you can join another family or start a new island.')));
      b.append(h('p', { class: 'lead' }, t('This island stays safe on this phone: you can go back to it any time (“↩️ Back to …” on the start screen), and your family keeps playing on it.')));
      b.append(h('div', { class: 'row' }, btn(t('Stay'), close, 'ghost'), btn(t('🧳 Move out'), () => { close(); g.moveOut(); }, 'danger')));
    },
  });
}

export const PANELS = {
  menu: menuPanel, basket: basketPanel, journal: journalPanel, board: boardPanel, shop: shopPanel, sell: sellPanel, cook: cookPanel,
  family: familyPanel, look: lookPanel, settings: settingsPanel, help: helpPanel, leave: leavePanel,
};
export { PROJECT_BY_ID };
