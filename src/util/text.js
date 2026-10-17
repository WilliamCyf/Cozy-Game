// Small text helpers shared by the screens and the host's rules.

// Keep at most n letters. A Thai letter can carry vowel and tone marks that are separate characters
// in the computer (คุณตาสมศักดิ์ is 9 letters but 13 characters), so we count whole letters
// ("graphemes") where the phone can, and never cut a mark off its letter.
export function shortText(s, n) {
  const str = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const parts = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(str), (x) => x.segment);
    return parts.length <= n ? str : parts.slice(0, n).join('');
  }
  return str.slice(0, n + 6); // older phones: a little extra room, so Thai marks are rarely cut
}

// A player's name: up to 12 letters (and never anything huge, whatever a phone sends).
export const cleanName = (s, fallback = 'Friend') => shortText(String(s ?? '').slice(0, 64), 12) || fallback;
