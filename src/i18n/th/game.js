// Thai translations: English sentence -> Thai sentence. Keep emojis, {placeholders} and line breaks.
// Part: the game itself (src/game/game.js, interact.js, fishing.js, players.js, src/world/world.js).
export default {
  'action|Fish': 'ตกปลา', // the big button by the water ("Fish" alone is the food/basket word)
  // ---- island name (islandName() in i18n.js)
  'Cozy Cove': 'อ่าวแสนสุข',
  'Day {n}': 'วันที่ {n}',

  // ---- family coming and going
  '{name} arrived on the island!': '{name} มาถึงเกาะแล้ว!',
  'Someone': 'ใครสักคน',
  '{name} went home for now.': '{name} กลับบ้านไปก่อนแล้ว',
  'Another island was using our code, so we got a new one: {code}': 'มีเกาะอื่นใช้รหัสเดียวกันอยู่ เราเลยได้รหัสเกาะใหม่: {code}',
  'Welcome home, {name}! Day {day} on {island}.': 'ยินดีต้อนรับกลับบ้านนะ {name}! วันที่ {day} ที่ {island}',
  'Welcome to the family island, {name}!': 'ยินดีต้อนรับสู่เกาะของครอบครัวนะ {name}!',
  'There’s a letter in the mailbox by the cottage!': 'มีจดหมายอยู่ในตู้จดหมายข้างบ้านแน่ะ!',
  'Friend': 'เพื่อน',

  // ---- doing things
  'Project complete!': 'ภารกิจสำเร็จแล้ว!',
  'High five! 🙌': 'ไฮไฟว์! 🙌',
  'Picked clean — fruit grows back in a little while.': 'เก็บหมดแล้ว — รออีกแป๊บ เดี๋ยวผลไม้ก็ออกมาใหม่นะ',
  'This {crop} is growing happily. Stage {n} of 4.': 'ต้น{crop}กำลังโตวันโตคืนเลย (ขั้นที่ {n} จาก 4)',
  'No mail.': 'ยังไม่มีจดหมายนะ',
  'Treasure! +{coins} coins and a {item}!': 'เจอสมบัติ! ได้ {coins} เหรียญ กับ{item}ด้วย!',
  'Cooking {name}…': 'กำลังทำ{name}…',
  'Made {name}!': 'ทำ{name}เสร็จแล้ว!',
  'Oops, the pot tipped over!': 'อุ๊ย หม้อคว่ำซะแล้ว!',

  // ---- first-time hints
  '👆 Slide your thumb on the island to walk around': '👆 ลากนิ้วบนเกาะเพื่อเดินไปรอบๆ นะ',
  '🎣 Walk to the water and press the big button to fish': '🎣 เดินไปริมน้ำ แล้วกดปุ่มใหญ่เพื่อตกปลา',
  '📋 Visit the Family Board next to the cottage': '📋 ไปดูกระดานครอบครัวข้างบ้านกันเถอะ',
  '🌱 Plant seeds in the garden by the cottage': '🌱 ไปปลูกเมล็ดในแปลงผักข้างบ้านกันเถอะ',

  // ---- connection troubles
  'Back to menu': 'กลับไปเมนู',
  'Lost the connection to the island…': 'การเชื่อมต่อกับเกาะหลุดไป…',
  'Reconnecting. (Is the host’s phone awake?)': 'กำลังเชื่อมต่อใหม่ (มือถือของเจ้าของเกาะยังเปิดอยู่ไหมนะ?)',
  'Back on the island!': 'กลับมาที่เกาะแล้ว!',
  'Couldn’t reach the island. Ask the host to open Cozy Cove, then try again.': 'ติดต่อเกาะไม่ได้ ลองบอกเจ้าของเกาะให้เปิดเกมไว้ แล้วลองใหม่อีกครั้งนะ',

  // ---- updates
  'Checking for updates…': 'กำลังตรวจหาอัปเดต…',
  'You have the newest version!': 'เกมเป็นเวอร์ชันล่าสุดแล้ว!',
  'A new version is on its way…': 'กำลังโหลดเวอร์ชันใหม่ให้นะ…',
  'Cozy Cove was updated to the newest version!': 'อัปเดตเกมเป็นเวอร์ชันใหม่ล่าสุดแล้ว!',
  '🔄 Update now': '🔄 อัปเดตเลย',
  'Couldn’t check right now.': 'ตอนนี้ยังตรวจไม่ได้ ไว้ลองใหม่นะ',

  // ---- fishing
  'Reeled in. Try another spot!': 'ม้วนสายกลับแล้ว ลองที่อื่นดูนะ!',
  'Too close to land — face the water!': 'ใกล้ฝั่งเกินไป — หันหน้าไปทางน้ำนะ!',
  'Hold to reel!': 'กดค้างเพื่อม้วนสาย!',
  'Too slow! Tap "Hook it!" when the bobber dips.': 'ช้าไปนิด! พอทุ่นจมลง ให้แตะ "ตวัดเบ็ด!" นะ',
  'It swam away… try again!': 'ปลาว่ายหนีไปแล้ว… ลองใหม่นะ!',
  'Let go!': 'ปล่อยนิ้ว!',
  'Wait…': 'รอก่อน…',
  'Reeling…': 'กำลังม้วนสาย…',
  'Snap! The line broke — let go when the fish pulls.': 'ผึง! สายขาดแล้ว — ตอนปลาดึง ให้ปล่อยนิ้วนะ',
  'The fish swam away. So close!': 'ปลาว่ายหนีไปแล้ว เกือบได้แล้วเชียว!',

  // ---- the big action button (interact.js)
  'Shop': 'ร้านค้า',
  'Sell': 'ขาย',
  'Mailbox': 'ตู้จดหมาย',
  'Fallen logs': 'ขอนไม้ขวางทาง',
  'Broken bridge': 'สะพานพัง',
  'Old lighthouse': 'ประภาคารเก่า',
  'Dig!': 'ขุดเลย!',
  'Sit together': 'นั่งด้วยกัน',
  'Sit': 'นั่ง',
  'Pick up': 'เก็บ',
  'Pick fruit': 'เก็บผลไม้',
  'No fruit yet': 'ยังไม่มีผลไม้',
  'Shake tree': 'เขย่าต้นไม้',
  'Plant seeds': 'ปลูกเมล็ด',
  'Harvest!': 'เก็บเกี่ยว!',
  'Water': 'รดน้ำ',
  'Growing…': 'กำลังโต…',
  'Pet Mochi': 'ลูบหัวโมจิ',
  'High five!': 'ไฮไฟว์!',

  // ---- loading the island (src/world/world.js)
  'Shaping the island…': 'กำลังปั้นเกาะ…',
  'Planting palm trees…': 'กำลังปลูกต้นมะพร้าว…',
  'Sprinkling flowers…': 'กำลังโปรยดอกไม้…',
  'Painting the shadows…': 'กำลังระบายเงา…',
  'Filling the sea…': 'กำลังเติมน้ำทะเล…',
  'Drawing the footpaths…': 'กำลังวาดทางเดิน…',

  // ---- the speed readout (Settings → Show speed)
  '{fps} fps · {calls} draws · {tris}k tris · {dpr}x': '{fps} เฟรม/วินาที · วาด {calls} ครั้ง · {tris} พันสามเหลี่ยม · ×{dpr}',
};
