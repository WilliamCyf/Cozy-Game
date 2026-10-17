// "What can I do here?" — looks around the player for the nearest thing to interact with
// and sets the big action button (Pick up / Plant / Water / Shop / Fish…).
// Labels stay English here (N_ marks them) and are translated on the button, so a language
// switch shows up straight away.
// Kids never need to choose tools: walk up to something and press the button.
import * as L from '../world/layout.js';
import { CROPS, ITEMS } from './data.js';
import { DIG_SPOT } from './spawns.js';
import { N_ } from '../i18n/i18n.js';

export class Interact {
  constructor(ctx) {
    this.ctx = ctx; // {world, session, players, fishing, critters}
    this.current = null;
    this.t = 0;
    const w = ctx.world;
    const fixed = [];
    fixed.push({ type: 'board', x: L.BOARD.x, z: L.BOARD.z + 0.4, r: 2.0, icon: '📋', label: N_('Family Board') });
    fixed.push({ type: 'shop', x: w.shop.front[0], z: w.shop.front[1] - 0.4, r: 2.3, icon: '🐢', label: N_('Shop') });
    fixed.push({ type: 'sell', x: L.CRATE.x, z: L.CRATE.z, r: 1.7, icon: '🪙', label: N_('Sell') });
    fixed.push({ type: 'cook', x: L.CAMPFIRE.x, z: L.CAMPFIRE.z, r: 2.6, icon: '🍳', label: N_('Cook') });
    fixed.push({ type: 'mail', x: L.MAILBOX.x, z: L.MAILBOX.z, r: 1.5, icon: '✉️', label: N_('Mailbox') });
    fixed.push({ type: 'logs', x: L.LOGS_BLOCK.x, z: L.LOGS_BLOCK.z + 1.5, r: 3.6, icon: '🪵', label: N_('Fallen logs'), when: (s) => !s.projects.path?.done });
    fixed.push({ type: 'bridge', x: L.BRIDGE.gap0 - 0.6, z: L.BRIDGE.z, r: 1.8, icon: '🌉', label: N_('Broken bridge'), when: (s) => !s.projects.bridge?.done });
    fixed.push({ type: 'lighthouse', x: L.LIGHTHOUSE.x, z: L.LIGHTHOUSE.z + 2.3, r: 2.0, icon: '💡', label: N_('Old lighthouse'), when: (s) => !s.projects.lighthouse?.done });
    fixed.push({ type: 'dig', x: DIG_SPOT.x, z: DIG_SPOT.z, r: 1.4, icon: '⛏️', label: N_('Dig!'), when: (s) => s.projects.bridge?.done && (s.treasure?.day || 0) < s.day });
    fixed.push({ type: 'picnic', x: L.PICNIC.x + 3.2, z: L.PICNIC.z, r: 2.4, icon: '🧺', label: N_('Sit together'), when: (s) => s.projects.picnic?.done });
    for (const [x, z] of [[-3, -9], [-38, -30], [30, 23], [L.PIER.x, L.PIER.z0 + 14]]) fixed.push({ type: 'bench', x, z, r: 1.4, icon: '🪑', label: N_('Sit') });
    this.fixed = fixed;
  }

  // returns the best thing to interact with (or null)
  find() {
    const { world, session, players, critters } = this.ctx;
    const s = session.state;
    const P = players.local;
    const hx = Math.sin(P.heading), hz = Math.cos(P.heading);
    let best = null, bestScore = Infinity;
    const consider = (o) => {
      const dx = o.x - P.x, dz = o.z - P.z;
      const d = Math.hypot(dx, dz);
      if (d > o.r + 0.6) return;
      // prefer things in front of us
      const facing = d > 0.01 ? (dx * hx + dz * hz) / d : 1;
      const score = d - o.r * 0.5 - facing * 0.6 + (o.prio || 0);
      if (score < bestScore) { bestScore = score; best = o; }
    };
    for (const [id, it] of Object.entries(s.items)) {
      if (Math.abs(it.x - P.x) > 3 || Math.abs(it.z - P.z) > 3) continue;
      consider({ type: 'pick', id, x: it.x, z: it.z, r: 1.0, icon: ITEMS[it.k]?.emoji || '✨', label: N_('Pick up'), prio: -0.6 });
    }
    world.bushes.forEach((b, i) => {
      const fruit = s.bushes[i]?.fruit || 0;
      consider({ type: 'bush', i, x: b.x, z: b.z, r: 1.9, icon: fruit ? ITEMS[b.kind].emoji : '🌿', label: fruit ? N_('Pick fruit') : N_('No fruit yet'), dim: !fruit });
    });
    world.palms.forEach((p, i) => {
      if (Math.abs(p.x - P.x) > 3 || Math.abs(p.z - P.z) > 3) return;
      consider({ type: 'shake', i, x: p.x, z: p.z, r: 1.3, icon: '🌴', label: s.palms[i]?.ready ? N_('Shake tree') : N_('Shake tree'), dim: !s.palms[i]?.ready });
    });
    world.plots.forEach((p, i) => {
      if (p.extra && !s.projects.garden?.done) return;
      const st = s.plots[i];
      let o;
      if (!st?.crop) o = { icon: '🌱', label: N_('Plant seeds') };
      else if (st.stage >= 3) o = { icon: CROPS[st.crop].emoji, label: N_('Harvest!') };
      else if (!st.water && s.weather !== 'rain') o = { icon: '💧', label: N_('Water') };
      else o = { icon: '🌿', label: N_('Growing…'), dim: true };
      consider({ type: 'plot', i, x: p.x, z: p.z, r: 1.55, ...o });
    });
    for (const f of this.fixed) if (!f.when || f.when(s)) consider(f);
    const cat = critters?.cat;
    if (cat) consider({ type: 'pet', x: cat.x, z: cat.z, r: 1.3, icon: '🐱', label: N_('Pet Mochi'), prio: -0.3 });
    // other family members: wave / high-five
    for (const [pid, r] of players.remotes) {
      if (!r.seen) continue;
      consider({ type: 'friend', x: r.x, z: r.z, r: 1.3, icon: '🙌', label: N_('High five!'), pid, prio: 0.4 });
    }
    if (best) return best;
    // nothing nearby — is there water to fish in?
    if (this.ctx.fishing.findWater(P) !== null) return { type: 'fish', icon: '🎣', label: N_('action|Fish') };
    return null;
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return this.current;
    this.t = 0.12;
    this.current = this.find();
    return this.current;
  }
}
