// Thai translations: English sentence -> Thai sentence. Keep emojis, {placeholders} and line breaks.
// Part: the HUD and the screens before the game (src/ui/ui.js, screens.js, lookeditor.js, src/main.js).
export default {
  // new versions
  'New version ready · tap to update': 'มีเวอร์ชันใหม่แล้ว · แตะเพื่ออัปเดต',
  '✨ Updated to the newest version!': '✨ อัปเดตเป็นเวอร์ชันใหม่ล่าสุดแล้ว!',
  'Version: {when}': 'เวอร์ชัน: {when}',
  // join screen: pick the picture, type the numbers
  'Tap the same picture': 'แตะรูปเดียวกับในมือถือเจ้าของเกาะ',
  'Type the 3 numbers': 'พิมพ์ตัวเลข 3 ตัว',
  'The 3 numbers': 'ตัวเลข 3 ตัว',
  'First tap the picture you see on the host’s phone': 'แตะรูปที่เห็นในมือถือเจ้าของเกาะก่อนนะ',
  'Type the 3 numbers next to the picture': 'พิมพ์ตัวเลข 3 ตัวที่อยู่ข้างรูปนะ',
  // ---------------------------------------------------------------- HUD (src/ui/ui.js)
  'Day {n}': 'วันที่ {n}',
  'Menu': 'เมนู',
  'Action': 'ปุ่มหลัก',
  'Emotes': 'ท่าทาง',
  'Basket': 'ตะกร้า',
  'Fish journal': 'สมุดบันทึกปลา',
  'Close': 'ปิด',
  'Explore': 'เดินเล่น',

  // the big button while fishing
  'Let go!': 'ปล่อยนิ้ว!',
  'Reel in': 'ม้วนสาย',
  'Hook it!': 'ตวัดเบ็ด!',
  'Wait…': 'รอก่อน…',
  'Reel!': 'ม้วนเลย!',
  'Yay!': 'เย้!',
  'Hold to reel!': 'กดค้างเพื่อม้วนสาย!',

  // choosing a bait
  '{name} ({n} left): {desc}': '{name} (เหลือ {n}): {desc}',
  '{name}: {desc}': '{name}: {desc}',

  // the catch card
  'You caught…': 'ตกได้…',
  'Treasure Chest!': 'หีบสมบัติ!',
  '+{n} coins for the family jar!': '+{n} เหรียญ เข้ากระปุกครอบครัว!',
  'Shiny! The lighthouse needs these.': 'วิบวับเลย! ประภาคารต้องใช้อันนี้นะ',
  'Hmm… not a fish. Someone lost a boot!': 'อืม… นี่ไม่ใช่ปลานี่นา มีใครทำรองเท้าบูทหายแน่เลย!',
  '{n} cm': '{n} ซม.',
  'NEW! {n}/{total}': 'ใหม่! {n}/{total}',
  'Family record!': 'สถิติใหม่ของครอบครัว!',
  'Aww 💛': 'น่ารักจัง 💛',
  'Yay! 🎉': 'เย้! 🎉',

  // ---------------------------------------------------------------- title screen (src/ui/screens.js)
  'a little island for the whole family': 'เกาะเล็กๆ สำหรับทุกคนในครอบครัว',
  '🏝️ Play on our island': '🏝️ เล่นบนเกาะของเรา',
  'A brand-new island is waiting!': 'มีเกาะใหม่เอี่ยมรออยู่นะ!',
  'Day {day} · {n}/{total} fish': 'วันที่ {day} · ปลา {n}/{total} ชนิด',
  '{island} · Day {day} · {n}/{total} fish': '{island} · วันที่ {day} · ปลา {n}/{total} ชนิด',
  '🤝 Join family': '🤝 เข้าร่วมครอบครัว',
  'Visit someone else’s island': 'ไปเที่ยวเกาะของคนอื่น',
  '👕 {name}’s look': '👕 หน้าตาของ{name}',
  'Make it an app! ': 'ทำเป็นแอปกันเถอะ! ',
  'Tap ': 'แตะ ',
  ' Share, then ': ' แชร์ แล้วเลือก ',
  '“Add to Home Screen”': '“เพิ่มไปยังหน้าจอโฮม”',
  'Up to 4 players · best on the same Wi-Fi': 'เล่นได้ถึง 4 คน · ใช้ไวไฟเดียวกันดีที่สุด',

  // making your islander
  'Make your islander!': 'มาสร้างตัวละครกันเถอะ!',
  'Your look': 'หน้าตาของฉัน',
  'Everyone in the family makes their own on their phone.': 'แต่ละคนในครอบครัวสร้างตัวละครในมือถือของตัวเองนะ',
  'Let’s go! 🏝️': 'ไปกันเลย! 🏝️',
  'Save': 'บันทึก',

  // joining a family island
  '🤝 Join your family': '🤝 ไปเที่ยวเกาะครอบครัว',
  'On the host’s phone, open the menu ☰ → ': 'ที่มือถือของเจ้าของเกาะ เปิดเมนู ☰ → ',
  'Family & Invite': 'ชวนครอบครัวมาเล่น',
  ' to see the island code.': ' แล้วจะเห็นรหัสเกาะ',
  '← Back': '← กลับ',
  'Join!': 'ไปเลย!',
  'Sailing to the island…': 'กำลังล่องเรือไปที่เกาะ…',
  'Looking for island {code}': 'กำลังหาเกาะ {code}',
  'Cancel': 'ยกเลิก',
  'Couldn’t find that island. Check the code, and make sure Cozy Cove is open on the host’s phone (same Wi-Fi works best).': 'หาเกาะนี้ไม่เจอเลย ลองเช็กรหัสอีกทีนะ และดูให้แน่ใจว่าเจ้าของเกาะเปิดเกมไว้บนมือถือแล้ว (ใช้ไวไฟเดียวกันจะดีที่สุด)',
  // the host saying "no" (sent from src/game/session.js, shown on the join screen)
  'The host sent you home for now. 🏡': 'เจ้าของเกาะให้กลับบ้านไปก่อนนะ 🏡',
  'Your game and the host’s game are different versions. Close and reopen both apps to update.': 'เกมของเรากับของเจ้าของเกาะเป็นคนละเวอร์ชันกัน ปิดแล้วเปิดเกมใหม่ทั้งสองเครื่องเพื่ออัปเดตนะ',
  'This phone is already the host of this island. Use another phone to join!': 'มือถือเครื่องนี้เป็นเจ้าของเกาะนี้อยู่แล้ว ใช้มือถือเครื่องอื่นเข้าร่วมนะ!',
  'This island is full (4 players). Try again when someone leaves.': 'เกาะนี้เต็มแล้ว (ผู้เล่น 4 คน) รอให้มีคนออกก่อน แล้วลองใหม่นะ',
  'The host closed the island for now. 🌙': 'เจ้าของเกาะปิดเกาะไว้ก่อนนะ 🌙',

  // ---------------------------------------------------------------- look editor (src/ui/lookeditor.js)
  'Name': 'ชื่อ',
  'Type your name': 'พิมพ์ชื่อตรงนี้',
  'Skin': 'สีผิว',
  'Shirt': 'สีเสื้อ',
  'Favourite colour': 'สีโปรด',
  'Hair': 'สีผม',
  'Hat': 'หมวก',
  'Unlock the {name} at Captain Shelly’s shop!': 'ไปซื้อ{name}ได้ที่ร้านของกัปตันเชลลี่นะ!',
  'Islander': 'ชาวเกาะ',

  // ---------------------------------------------------------------- starting up (src/main.js)
  'Waking up the crabs…': 'กำลังปลุกน้องปู…',
  'Oh no — this phone couldn’t start the 3D graphics. Try closing other apps and opening Cozy Cove again.': 'แย่จัง — มือถือเครื่องนี้เปิดภาพ 3 มิติไม่ได้ ลองปิดแอปอื่นๆ แล้วเปิดเกมนี้ใหม่อีกครั้งนะ',
};
