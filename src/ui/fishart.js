// Draws a cute picture of each fish for the Fish Journal (as SVG = shapes, not pixels,
// so they stay crisp at any size and cost no downloads).
import { FISH_BY_ID } from '../game/data.js';

const INK = '#5a3d2b';
let uid = 0;

function fishBody(a, shape) {
  // proportions per body type
  const P = {
    slim: { len: 78, h: 15, tail: 18 }, round: { len: 62, h: 22, tail: 16 }, tall: { len: 66, h: 26, tail: 17 },
    big: { len: 84, h: 25, tail: 20 }, sword: { len: 74, h: 14, tail: 18 }, catfish: { len: 76, h: 17, tail: 16 },
    angel: { len: 54, h: 24, tail: 14 }, lion: { len: 60, h: 20, tail: 14 }, puffer: { len: 54, h: 27, tail: 13 },
  }[shape] || { len: 70, h: 20, tail: 17 };
  const nose = 98, tb = nose - P.len, cy = 42;
  const h = P.h;
  const id = 'f' + ++uid;
  const body = `M${nose},${cy} C${nose - 8},${cy - h * 1.1} ${tb + 16},${cy - h} ${tb},${cy - h * 0.25} L${tb},${cy + h * 0.25} C${tb + 16},${cy + h} ${nose - 8},${cy + h * 1.05} ${nose},${cy} Z`;
  const tail = shape === 'round' || shape === 'puffer'
    ? `M${tb + 3},${cy} Q${tb - P.tail},${cy - P.tail * 1.1} ${tb - P.tail + 2},${cy} Q${tb - P.tail},${cy + P.tail * 1.1} ${tb + 3},${cy} Z`
    : `M${tb + 4},${cy} L${tb - P.tail},${cy - P.tail} Q${tb - P.tail * 0.45},${cy} ${tb - P.tail},${cy + P.tail} Z`;
  let fins = '';
  if (shape === 'angel') {
    fins += `<path d="M${tb + 14},${cy - h * 0.7} L${tb + 2},${cy - h * 2.1} L${nose - 26},${cy - h * 0.8} Z" fill="${a.fin}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
    fins += `<path d="M${tb + 14},${cy + h * 0.7} L${tb + 2},${cy + h * 2.1} L${nose - 26},${cy + h * 0.8} Z" fill="${a.fin}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
  } else if (shape === 'lion') {
    for (let i = 0; i < 7; i++) {
      const x = tb + 10 + i * 6;
      fins += `<path d="M${x},${cy - h * 0.8} L${x - 6 + i},${cy - h * 2.2 + (i % 2) * 6} L${x + 4},${cy - h * 0.85}" fill="${i % 2 ? a.fin : a.body}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
      fins += `<path d="M${x},${cy + h * 0.8} L${x - 6 + i},${cy + h * 1.8} L${x + 4},${cy + h * 0.85}" fill="${i % 2 ? a.body : a.fin}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
    }
  } else {
    fins += `<path d="M${tb + 18},${cy - h * 0.8} Q${tb + 30},${cy - h * 1.6} ${nose - 30},${cy - h * 0.92} Z" fill="${a.fin}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
    fins += `<path d="M${tb + 22},${cy + h * 0.82} Q${tb + 30},${cy + h * 1.35} ${tb + 40},${cy + h * 0.9} Z" fill="${a.fin}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;
  }
  let pat = '';
  const c = a.patc || '#fff';
  switch (a.pat) {
    case 'stripes': for (let i = 0; i < 4; i++) pat += `<rect x="${tb + 12 + i * 14}" y="0" width="5" height="90" fill="${c}"/>`; break;
    case 'bands': for (let i = 0; i < 3; i++) pat += `<rect x="${tb + 8 + i * (P.len / 3.2)}" y="0" width="8" height="90" fill="${c}" stroke="${INK}" stroke-width="2"/>`; break;
    case 'spots': for (let i = 0; i < 9; i++) pat += `<circle cx="${tb + 14 + (i * 23) % (P.len - 18)}" cy="${cy - h * 0.6 + ((i * 37) % (h * 1.2))}" r="${2.5 + (i % 3)}" fill="${c}"/>`; break;
    case 'patches': pat += `<ellipse cx="${nose - 22}" cy="${cy - h * 0.4}" rx="12" ry="9" fill="${c}"/><ellipse cx="${tb + 20}" cy="${cy + 2}" rx="10" ry="12" fill="${c}"/>`; break;
    case 'rainbow': pat += `<rect x="0" y="${cy - 3}" width="120" height="7" fill="${c}" opacity="0.85"/>`; break;
    case 'scales': for (let i = 0; i < 12; i++) pat += `<path d="M${tb + 14 + (i % 6) * 9},${cy - 8 + Math.floor(i / 6) * 10} q4,5 8,0" fill="none" stroke="${c}" stroke-width="2"/>`; break;
    case 'waves': for (let i = 0; i < 3; i++) pat += `<path d="M${tb + 8},${cy - h * 0.55 + i * 5} q6,-5 12,0 t12,0 t12,0 t12,0" fill="none" stroke="${c}" stroke-width="2.2"/>`; break;
    case 'stripe1': pat += `<rect x="0" y="${cy - 2}" width="120" height="3.5" fill="${c}"/>`; break;
    case 'glow': pat += `<ellipse cx="${nose - 30}" cy="${cy - h * 0.3}" rx="${P.len * 0.3}" ry="${h * 0.4}" fill="${c}" opacity="0.6"/>`; break;
    default:
  }
  let extra = '';
  if (shape === 'sword') extra += `<path d="M${nose - 2},${cy - 2} L${nose + 20},${cy - 1} L${nose - 2},${cy + 2} Z" fill="${a.fin}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
  if (shape === 'catfish') extra += `<path d="M${nose - 3},${cy + 2} q10,8 16,4 M${nose - 4},${cy + 4} q6,12 14,12" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
  if (shape === 'puffer') for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2, rx = P.len * 0.5, cx = tb + P.len * 0.55;
    const x0 = cx + Math.cos(ang) * rx * 0.85, y0 = cy + Math.sin(ang) * h * 0.9;
    extra += `<path d="M${x0},${y0} l${Math.cos(ang) * 6},${Math.sin(ang) * 6}" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
  }
  const eyeX = nose - (shape === 'puffer' ? 16 : 12), eyeY = cy - h * 0.25;
  return `
    <defs><clipPath id="${id}"><path d="${body}"/></clipPath></defs>
    ${fins}
    <path d="${tail}" fill="${a.fin}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${body}" fill="${a.body}"/>
    <g clip-path="url(#${id})">
      <rect x="0" y="${cy + 2}" width="120" height="60" fill="${a.belly}" opacity="0.9"/>
      ${pat}
    </g>
    <path d="${body}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M${tb + P.len * 0.62},${cy - h * 0.5} q-5,${h * 0.5} 0,${h}" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity="0.6"/>
    ${extra}
    <circle cx="${eyeX}" cy="${eyeY}" r="4.6" fill="#fff" stroke="${INK}" stroke-width="2"/>
    <circle cx="${eyeX + 1}" cy="${eyeY}" r="2.3" fill="${INK}"/>
    <path d="M${nose - 5},${cy + 4} q-3,3 -6,1" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
}

function special(a, shape) {
  const S = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
  switch (shape) {
    case 'flat':
      return `<ellipse cx="58" cy="44" rx="44" ry="24" fill="${a.fin}" ${S}/><ellipse cx="58" cy="44" rx="36" ry="18" fill="${a.body}" ${S}/>
        ${[0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${32 + i * 8}" cy="${38 + (i % 3) * 6}" r="2.5" fill="${a.patc}"/>`).join('')}
        <path d="M14,44 L2,32 L4,56 Z" fill="${a.fin}" ${S}/><circle cx="82" cy="36" r="4" fill="#fff" ${S}/><circle cx="88" cy="42" r="4" fill="#fff" ${S}/><circle cx="83" cy="36" r="2" fill="${INK}"/><circle cx="89" cy="42" r="2" fill="${INK}"/>`;
    case 'jelly':
      return `${[0, 1, 2, 3, 4].map((i) => `<path d="M${38 + i * 11},50 q-6,12 0,22 q6,8 0,14" fill="none" stroke="${a.fin}" stroke-width="3.5" stroke-linecap="round"/>`).join('')}
        <path d="M30,52 Q30,14 60,14 Q90,14 90,52 Q75,46 60,52 Q45,46 30,52 Z" fill="${a.body}" ${S}/>
        <path d="M44,30 q16,-10 32,0" fill="none" stroke="${a.fin}" stroke-width="4" stroke-linecap="round"/><circle cx="52" cy="38" r="2.5" fill="${INK}"/><circle cx="68" cy="38" r="2.5" fill="${INK}"/><path d="M56,44 q4,3 8,0" fill="none" ${S}/>`;
    case 'seahorse':
      return `<path d="M62,10 Q82,12 78,28 Q74,40 62,44 Q76,52 70,66 Q64,80 50,76 Q42,72 50,66 Q58,62 54,56 Q44,48 50,34 Q42,30 34,32 Q30,26 40,22 Q46,12 62,10 Z" fill="${a.body}" ${S}/>
        <path d="M76,36 L90,32 L84,44 Z" fill="${a.fin}" ${S}/><circle cx="58" cy="20" r="3.6" fill="#fff" ${S}/><circle cx="58" cy="20" r="1.8" fill="${INK}"/>
        ${[0, 1, 2, 3].map((i) => `<path d="M${60 - i},${30 + i * 9} q6,2 10,0" fill="none" stroke="${a.fin}" stroke-width="2.5"/>`).join('')}`;
    case 'squid':
      return `${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${30},${34 + i * 3} q-14,${-6 + i * 3} -24,${-8 + i * 4}" fill="none" stroke="${a.fin}" stroke-width="4" stroke-linecap="round"/>`).join('')}
        <path d="M30,30 Q60,18 96,40 Q60,62 30,50 Z" fill="${a.body}" ${S}/><path d="M96,40 L110,28 L108,52 Z" fill="${a.fin}" ${S}/>
        ${[0, 1, 2, 3].map((i) => `<circle cx="${50 + i * 10}" cy="${36 + (i % 2) * 8}" r="3" fill="${a.patc}"/>`).join('')}<circle cx="40" cy="38" r="4" fill="#fff" ${S}/><circle cx="39" cy="38" r="2" fill="${INK}"/>`;
    case 'octopus':
      return `${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${36 + i * 10},50 q${-8 + i * 3},16 ${-2 + i * 2},26 q4,4 8,0" fill="none" stroke="${a.body}" stroke-width="7" stroke-linecap="round"/>`).join('')}
        <ellipse cx="60" cy="34" rx="28" ry="24" fill="${a.body}" ${S}/>${[0, 1, 2].map((i) => `<circle cx="${48 + i * 12}" cy="${22 + (i % 2) * 4}" r="3" fill="${a.patc}"/>`).join('')}
        <circle cx="50" cy="38" r="5" fill="#fff" ${S}/><circle cx="70" cy="38" r="5" fill="#fff" ${S}/><circle cx="51" cy="39" r="2.4" fill="${INK}"/><circle cx="71" cy="39" r="2.4" fill="${INK}"/><path d="M56,48 q4,4 8,0" fill="none" ${S}/>`;
    case 'frog':
      return `<ellipse cx="60" cy="50" rx="32" ry="20" fill="${a.body}" ${S}/><ellipse cx="60" cy="56" rx="22" ry="11" fill="${a.belly}"/>
        <circle cx="44" cy="30" r="10" fill="${a.body}" ${S}/><circle cx="76" cy="30" r="10" fill="${a.body}" ${S}/><circle cx="44" cy="30" r="5" fill="#fff"/><circle cx="76" cy="30" r="5" fill="#fff"/><circle cx="45" cy="31" r="2.6" fill="${INK}"/><circle cx="77" cy="31" r="2.6" fill="${INK}"/>
        <path d="M46,48 q14,10 28,0" fill="none" ${S}/><path d="M30,64 q-10,6 -16,2 M90,64 q10,6 16,2" fill="none" stroke="${a.fin}" stroke-width="5" stroke-linecap="round"/>`;
    case 'ray':
      return `<path d="M60,18 Q86,30 112,44 Q86,52 60,64 Q34,52 8,44 Q34,30 60,18 Z" fill="${a.body}" ${S}/><path d="M60,64 Q62,76 70,86" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M48,30 q12,-6 24,0" fill="none" stroke="${a.belly}" stroke-width="3" stroke-linecap="round"/><circle cx="52" cy="38" r="3" fill="#fff"/><circle cx="68" cy="38" r="3" fill="#fff"/><circle cx="52" cy="38" r="1.6" fill="${INK}"/><circle cx="68" cy="38" r="1.6" fill="${INK}"/>`;
    case 'oyster':
      return `<path d="M20,50 Q24,22 60,20 Q96,22 100,50 Q60,40 20,50 Z" fill="${a.body}" ${S}/><path d="M20,50 Q60,74 100,50 Q60,58 20,50 Z" fill="${a.fin}" ${S}/>
        <circle cx="60" cy="48" r="9" fill="${a.belly}" ${S}/><circle cx="57" cy="45" r="2.5" fill="#fff"/>`;
    case 'boot':
      return `<path d="M44,12 L72,12 L72,52 Q100,52 104,64 L104,74 L40,74 L40,52 Z" fill="${a.body}" ${S}/><path d="M40,68 L104,68" ${S}/><path d="M50,22 l14,0 M50,32 l14,0 M50,42 l14,0" stroke="${a.fin}" stroke-width="3" stroke-linecap="round"/><path d="M60,70 q-6,-6 -14,-2" fill="none" stroke="#7fd0e0" stroke-width="2.5"/>`;
    default:
      return null;
  }
}

export function fishSVG(id, { silhouette = false } = {}) {
  const f = FISH_BY_ID[id];
  if (!f) return '';
  let a = f.art;
  if (silhouette) a = { ...a, body: '#c9b79c', belly: '#c9b79c', fin: '#b5a283', patc: '#c9b79c', pat: 'none' };
  const inner = special(a, a.shape) ?? fishBody(a, a.shape);
  return `<svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg" class="fish-svg${silhouette ? ' sil' : ''}">${inner}</svg>`;
}
