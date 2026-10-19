// Thai translations: English sentence -> Thai sentence. Keep emojis, {placeholders} and line breaks.
// Part: the HUD and the screens before the game (src/ui/ui.js, screens.js, lookeditor.js, src/main.js).
export default {
  // new versions
  'New version ready · tap to update': 'มีเวอร์ชันใหม่แล้ว · แตะเพื่ออัปเดต',
  '✨ Updated to the newest version!': '✨ อัปเดตเป็นเวอร์ชันใหม่ล่าสุดแล้ว!',
  'Version: {when}': 'เวอร์ชัน: {when}',
  // join screen: pick the picture, type the numbers
  'Tap the same picture': 'แตะรูปเดียวกับในมือถืออีกเครื่อง',
  'Type the 3 numbers': 'พิมพ์ตัวเลข 3 ตัว',
  'The 3 numbers': 'ตัวเลข 3 ตัว',
  'First tap the picture you see on the other phone': 'แตะรูปที่เห็นในมือถืออีกเครื่องก่อนนะ',
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
  'Day {day} · {n}/{total} fish': 'วันที่ {day} · ปลา {n}/{total} ชนิด',
  '{island} · Day {day} · {n}/{total} fish': '{island} · วันที่ {day} · ปลา {n}/{total} ชนิด',
  // the big buttons: play this phone's island, or join a family (and the way back to an island you moved out of)
  '🏝️ Play': '🏝️ เล่นเลย',
  '🤝 Join another family': '🤝 เข้าร่วมเกาะอื่น',
  'Move to a family member’s island': 'ย้ายไปเกาะของคนในครอบครัว',
  'Play on your family’s island': 'เล่นบนเกาะของครอบครัว',
  '🌱 Start a new family island': '🌱 เริ่มเกาะใหม่ของครอบครัว',
  '↩️ Back to {island} · Day {day}': '↩️ กลับไปที่ {island} · วันที่ {day}',
  '👕 {name}’s look': '👕 หน้าตาของ{name}',
  'Make it an app! ': 'ทำเป็นแอปกันเถอะ! ',
  'Tap ': 'แตะ ',
  ' Share, then ': ' แชร์ แล้วเลือก ',
  '“Add to Home Screen”': '“เพิ่มไปยังหน้าจอโฮม”',
  'The Home Screen app keeps its own copy: open it once and join your family there too.': 'แอปบนหน้าจอโฮมจะเก็บเกาะแยกไว้ต่างหาก เปิดแอปนั้นสักครั้ง แล้วเข้าร่วมครอบครัวในนั้นด้วยนะ',
  'Up to 4 players · best on the same Wi-Fi': 'เล่นได้ถึง 4 คน · ใช้ไวไฟเดียวกันดีที่สุด',

  // starting a new family island (a short question first: most people want to join their family instead)
  'Start a new family island?': 'เริ่มเกาะใหม่ไหม?',
  'If someone in your family already plays Cozy Cove, join their island instead: the whole family shares one island.': 'ถ้ามีคนในครอบครัวเล่นเกมนี้อยู่แล้ว เข้าร่วมเกาะของเขาแทนดีกว่านะ ทั้งครอบครัวจะได้อยู่เกาะเดียวกัน',
  '🌱 Start a new island': '🌱 เริ่มเกาะใหม่',

  // shown once after the update: is the island on this phone the family's island?
  'Family islands are here!': 'ใหม่! เกาะของครอบครัว',
  'Now every family member’s phone keeps the island, and anyone can play any time, even when the others are away.': 'ตอนนี้ทุกคนในครอบครัวมีเกาะเดียวกันอยู่ในมือถือของตัวเอง ใครจะเล่นตอนไหนก็ได้ ถึงคนอื่นจะไม่อยู่ก็เล่นได้นะ',
  'Is {island} (Day {day}) your family’s island?': '{island} (วันที่ {day}) เป็นเกาะของครอบครัวใช่ไหม?',
  '🏡 Yes, this is our family island': '🏡 ใช่ นี่เกาะของครอบครัวเรา',
  '🤝 No, I’ll join my family’s island': '🤝 ไม่ใช่ จะเข้าร่วมครอบครัว',
  'If you join your family, this island stays safe on this phone. You can go back to it from the start screen.': 'ถ้าเข้าร่วมครอบครัว เกาะนี้ก็ยังอยู่ในมือถือเครื่องนี้ ไม่หายไปไหน กลับไปเล่นได้จากหน้าแรกนะ',

  // moving to another family's island (this phone's island is kept safe)
  'Move to {island}?': 'ย้ายไปที่ {island} ไหม?',
  'Your island {island} (Day {day}) stays safe on this phone: you can go back to it any time from the start screen.': 'เกาะของเรา {island} (วันที่ {day}) ยังอยู่ในมือถือเครื่องนี้ ไม่หายไปไหน กลับไปได้ทุกเมื่อจากหน้าแรกนะ',
  '🧳 Move': '🧳 ย้ายเลย',

  // making your islander
  'Make your islander!': 'มาสร้างตัวละครกันเถอะ!',
  'Your look': 'หน้าตาของฉัน',
  'Everyone in the family makes their own on their phone.': 'แต่ละคนในครอบครัวสร้างตัวละครในมือถือของตัวเองนะ',
  'Let’s go! 🏝️': 'ไปกันเลย! 🏝️',
  'Save': 'บันทึก',

  // joining a family island
  '🤝 Join your family': '🤝 เข้าร่วมครอบครัว',
  'On a family member’s phone, open the menu ☰ → ': 'ที่มือถือของคนในครอบครัว เปิดเมนู ☰ → ',
  'Family & Invite': 'ชวนครอบครัวมาเล่น',
  ' to see the island code.': ' แล้วจะเห็นรหัสเกาะ',
  '← Back': '← กลับ',
  'Join!': 'ไปเลย!',
  'Sailing to the island…': 'กำลังล่องเรือไปที่เกาะ…',
  'Looking for island {code}': 'กำลังหาเกาะ {code}',
  'Cancel': 'ยกเลิก',
  // what went wrong while joining (src/main.js)
  'That phone didn’t answer. Make sure both phones have the newest version of Cozy Cove.': 'มือถือเครื่องนั้นไม่ตอบกลับมาเลย ลองเช็กว่าทั้งสองเครื่องอัปเดตเกมเป็นเวอร์ชันล่าสุดแล้วหรือยังนะ',
  'Couldn’t find that island. Check the code, and make sure Cozy Cove is open on a family member’s phone (same Wi-Fi works best).': 'หาเกาะนี้ไม่เจอเลย ลองเช็กรหัสอีกทีนะ แล้วให้คนในครอบครัวเปิดเกมค้างไว้ในมือถือด้วย (ใช้ไวไฟเดียวกันจะดีที่สุด)',
  // the other phone saying "no" (sent from src/game/session.js, shown on the join screen)
  'Your game and the host’s game are different versions. Close and reopen both apps to update.': 'เกมของเรากับของมือถืออีกเครื่องเป็นคนละเวอร์ชันกัน ปิดแล้วเปิดเกมใหม่ทั้งสองเครื่องเพื่ออัปเดตนะ',
  'This island is full (4 players). Try again when someone leaves.': 'เกาะนี้เต็มแล้ว (ผู้เล่น 4 คน) รอให้มีคนออกก่อน แล้วลองใหม่นะ',

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
  'The Home Screen app gets its own island, separate from this one in Safari.': 'แอปบนหน้าจอโฮมจะมีเกาะของตัวเอง แยกจากเกาะนี้ในซาฟารี',
  '🌡️ Running at 30 fps for now, to keep the phone cool. It goes back to 60 by itself.': '🌡️ ตอนนี้เล่นที่ 30 เฟรมไปก่อน เพื่อไม่ให้มือถือร้อน เดี๋ยวจะกลับไปเป็น 60 เฟรมเอง',
};
