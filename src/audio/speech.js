// "Read to me": the iPhone reads a letter or a message in a bottle aloud, in Thai or English,
// for little ones (and anyone) who can't read it. It uses the phone's own built-in voices and does
// nothing at all until the 🔊 button is tapped, so it costs no battery while playing.
import { getLang } from '../i18n/i18n.js';

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export function speak(text) {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  // emoji would be read out by name ("fish emoji"), so leave them out
  const clean = String(text || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim();
  if (!clean) return;
  const thai = getLang() === 'th';
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = thai ? 'th-TH' : 'en-GB';
  const voice = synth.getVoices().find((v) => (v.lang || '').toLowerCase().startsWith(thai ? 'th' : 'en'));
  if (voice) u.voice = voice;
  u.rate = thai ? 0.9 : 0.95; // a little slower: easier to follow for kids
  u.pitch = 1.05;
  synth.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
