// Small text helpers shared by the screens and the host's rules.

// A Thai letter can carry vowel and tone marks that are separate characters in the computer
// (คุณตาสมศักดิ์ is 9 letters but 13 characters), so we count whole letters ("graphemes") where
// the phone can, and never cut a mark off its letter.
let seg = null;
function letters(str) {
  if (typeof Intl === 'undefined' || !Intl.Segmenter) return null;
  seg ||= new Intl.Segmenter(undefined, { granularity: 'grapheme' }); // (made once)
  return Array.from(seg.segment(str), (x) => x.segment);
}

// The first n letters, exactly as typed (used while typing, so spaces are kept).
export function firstLetters(s, n) {
  const str = String(s ?? '');
  const parts = letters(str);
  if (!parts) return str.slice(0, n + 6); // older phones: a little extra room, so Thai marks are rarely cut
  return parts.length <= n ? str : parts.slice(0, n).join('');
}

// Keep at most n letters, with extra spaces tidied away.
export function shortText(s, n) {
  return firstLetters(String(s ?? '').replace(/\s+/g, ' ').trim(), n);
}

// A player's name: up to 12 letters (and never anything huge, whatever a phone sends).
export const cleanName = (s, fallback = 'Friend') => shortText(String(s ?? '').slice(0, 64), 12) || fallback;

// A text box that stops at n letters while typing (Thai marks don't count as extra letters),
// so the box never shows more than will be saved.
export function limitLetters(input, n) {
  const count = (s) => letters(s)?.length ?? s.length;
  const cut = (e) => {
    if (e?.isComposing) return; // (Chinese/Japanese keyboards: wait until the word is finished)
    const v = input.value;
    if (firstLetters(v, n) === v) return;
    // too long: drop the new letters where they were typed (also in the middle of the name),
    // keep the rest, and leave the cursor where it was
    const at = input.selectionEnd ?? v.length;
    const after = v.slice(at);
    const before = firstLetters(v.slice(0, at), Math.max(0, n - count(after)));
    let nv = before + after;
    if (firstLetters(nv, n) !== nv) nv = firstLetters(nv, n);
    input.value = nv;
    try { input.setSelectionRange(Math.min(before.length, nv.length), Math.min(before.length, nv.length)); } catch { /* ignore */ }
  };
  input.addEventListener('input', cut);
  input.addEventListener('compositionend', cut);
}
