// ตัวซ้อม "ดันสต็อกกลับมาร์เก็ตเพลส" — คำนวณว่าถ้าดันจริงจะส่งอะไรไปบ้าง
//
// ⚠️⚠️ **ไฟล์นี้ไม่มีคำสั่งเขียนกลับแพลตฟอร์มเลยแม้แต่บรรทัดเดียว โดยตั้งใจ**
//    ไม่ใช่ "มีแต่ปิดไว้" — คือ **ไม่มีอยู่จริง** ⇒ ต่อให้เรียกผิด ตั้งค่าผิด หรือมีคนแก้พลาด
//    ก็ยิงของขึ้นแพลตฟอร์มไม่ได้ เพราะไม่มีโค้ดให้ยิง
//    วันที่จะดันจริง ให้เขียนไฟล์ใหม่แยกต่างหาก **ห้ามเติม POST ลงในไฟล์นี้**
//    (เหตุผล: ดันสต็อกผิด = ลูกค้าสั่งของที่ไม่มี หรือของมีแต่ปิดขาย ทั้งสองทางเสียเงินจริง
//     และแก้ย้อนหลังไม่ได้ทันเพราะออเดอร์เข้ามาแล้ว)
//
// ⚠️ **ทำไมต้องมีตัวซ้อมก่อน** — ZORT ทำหน้าที่ดันสต็อกให้ 3 แพลตฟอร์มอยู่ตอนนี้
//    ถ้าเราแทนไม่ได้ ก็ตัด ZORT ไม่ได้ ต่อให้ทำจอครบทั้ง 47 จอ
//    แต่จะกล้าดันจริงได้ ต้องเห็นก่อนว่า "ถ้าดันวันนี้ จะเปลี่ยนอะไรบ้าง กี่รหัส จากเท่าไหร่เป็นเท่าไหร่"
//
// ⚠️ **กติกาความปลอดภัย 3 ข้อ ที่ตัดสินว่ารหัสไหน "ดันได้"**
//    ① คลังเราติดลบ ⇒ **ห้ามดัน** (ติดลบแปลว่าข้อมูลเราผิด ไม่ใช่ว่าของหมด)
//    ② คลังเราไม่รู้จักรหัสนั้น ⇒ **ห้ามดัน** (ไม่รู้ ≠ ศูนย์)
//    ③ เท่ากันอยู่แล้ว ⇒ ไม่ต้องดัน (ลดจำนวนคำขอ = ลดโอกาสโดนจำกัดอัตรา)
//    ⚠️ ข้อ ① กับ ② ห้ามยุบรวมเป็น "ไม่ดัน" เฉย ๆ — คนละสาเหตุ คนละวิธีแก้
//       ติดลบ = ไปนับของ · ไม่รู้จัก = ไปผูกรหัสให้ตรงกัน

/* 🔑 **กติกาของทั้งไฟล์: ตัวเทียบสต็อกทุกเจ้าใช้ `skip` = "ทำต่อไม่ได้" เท่านั้น**
   `note` สงวนไว้สำหรับ **คำอธิบายผลลัพธ์ที่สำเร็จ** ⇒ **ห้ามเอา `c.note` มาตัดสินว่าข้าม**
   (แยกชื่อกันเมื่อ 6 ก.ย. 2569 หลังเจอว่า Lazada พังเพราะสองความหมายปนกัน) */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** แปลงผลเทียบสต็อกของแพลตฟอร์มหนึ่ง → แผนการดัน
 *  @param rows  [{ sku, name, platformQty, coreQty, known }]
 *               known=false แปลว่าคลังเราไม่รู้จักรหัสนี้ (ห้ามเดาเป็น 0)
 */
function planFrom(rows) {
  const push = [];
  const skipNegative = [];
  const skipUnknown = [];
  let same = 0;

  for (const r of rows) {
    if (!r.known) {
      skipUnknown.push({ sku: r.sku, name: r.name, platformQty: r.platformQty });
      continue;
    }
    const to = num(r.coreQty);
    const from = num(r.platformQty);
    if (to < 0) {
      skipNegative.push({ sku: r.sku, name: r.name, platformQty: from, coreQty: to });
      continue;
    }
    if (to === from) {
      same += 1;
      continue;
    }
    push.push({
      sku: r.sku,
      name: r.name,
      from,
      to,
      delta: to - from,
      /* ⚠️ แยกสองเคสนี้ออกมาเพราะ **ผลต่อร้านตรงข้ามกัน**
          reopen = ของมีแต่ปิดขายอยู่ ⇒ ดันแล้ว "ได้เงินคืน"
          close  = แพลตฟอร์มโชว์ว่ามีแต่เราไม่มี ⇒ ดันแล้ว "กันรับออเดอร์ที่ส่งไม่ได้"
          รวมกันเป็น "เปลี่ยน N รหัส" จะอ่านไม่ออกว่าคุ้มหรือเสี่ยง */
      kind: from === 0 && to > 0 ? "reopen" : to === 0 && from > 0 ? "close" : to > from ? "up" : "down",
    });
  }

  push.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const by = (k) => push.filter((p) => p.kind === k);
  return {
    platformSkus: rows.length,
    same,
    wouldPush: push.length,
    reopen: by("reopen").length,
    close: by("close").length,
    up: by("up").length,
    down: by("down").length,
    skipNegative: skipNegative.length,
    skipUnknown: skipUnknown.length,
    /* ⚠️ **ตัวตรวจตัวเอง** — ทุกรหัสต้องตกกองใดกองหนึ่งพอดี
        บวกไม่ครบเมื่อไหร่ = มีของหายระหว่างทาง (partial-coverage-reported-as-full) */
    bucketsAddUp: same + push.length + skipNegative.length + skipUnknown.length === rows.length,
    // ตัวอย่างพอให้เห็นภาพ — **ตัวนับข้างบนนับจากของทั้งหมด ไม่ได้นับจากตัวอย่างนี้**
    pushSample: push.slice(0, 25),
    skipNegativeSample: skipNegative.slice(0, 15),
    skipUnknownSample: skipUnknown.slice(0, 15),
  };
}

/** ── Shopee ──
 *  ใช้ผลจาก shopeeStockCompare() ที่มีอยู่แล้ว **ไม่ยิง Shopee ซ้ำ**
 *  ⚠️ `diff` ของตัวนั้นมีเฉพาะรหัสที่ "ไม่ตรงกัน" · รหัสที่ตรงกันอยู่ในตัวนับ `same`
 *     ⇒ ตัวเลข platformSkus ต้องเอามาจากตัวนับ ไม่ใช่ `diff.length`
 */
async function shopeePlan() {
  const { shopeeStockCompare } = await import("./shopee-stock.mjs");
  /* ⚠️ ต้องขอ full:1 เสมอ — ค่าเริ่มต้นของตัวเทียบตัด diff ไว้ 50 ตัวเพื่อการแสดงผล
      แผนดันที่คิดจากตัวอย่าง = รหัสที่เกิน 50 หายจากแผนเงียบ ๆ (เจอจริง 5 ก.ย. 2569:
      diffCount 55 แต่แผนเห็นแค่ 50 ⇒ bucketsAddUp ฟ้อง false ซึ่งคือหน้าที่ของมันพอดี) */
  const c = await shopeeStockCompare({ full: 1 });
  /* ✅ **ตรงนี้เคยถูกอยู่แล้ว ไม่ได้แก้ตามรูปแบบ** — เส้นสำเร็จของ shopeeStockCompare
      ไม่มี `note` ⇒ เช็ค c.note จึงจับเฉพาะกรณีหยุดจริง (ต่างจาก Lazada ที่พัง)
      แต่มันคือระเบิดเวลา: วันที่มีคนเติมคำอธิบายลงเส้นสำเร็จ Shopee จะเงียบตายแบบเดียวกัน
      ⇒ เปลี่ยนต้นทางให้ใช้ `skip` แล้ว ตรงนี้จึงเหลือเช็ค skip อย่างเดียว */
  if (c.skip) return { skip: c.skip };

  const rows = [
    // รหัสที่ตัวเลขไม่ตรง — รู้ทั้งสองฝั่ง
    ...(c.diff || []).map((d) => ({
      sku: d.sku, name: d.name, platformQty: num(d.shopee), coreQty: num(d.core), known: true,
    })),
    // รหัสที่คลังเราไม่รู้จัก — **ต้องนับด้วย ห้ามตกหล่น** (ของจริง 15 รหัส)
    ...(c.missingSample || []).map((m) => ({
      sku: m.sku, name: m.name, platformQty: null, coreQty: null, known: false,
    })),
  ];
  const p = planFrom(rows);
  /* ⚠️ `same` ที่ได้จาก planFrom นับจากแถวที่ส่งเข้าไปเท่านั้น (ซึ่งเป็นแถวที่ต่างกัน)
      ของจริงต้องเอาตัวนับ `same` ของตัวเทียบมาใช้ ไม่งั้นจะได้ 0 แล้วดูเหมือนไม่มีอะไรตรงเลย */
  p.same = num(c.same);
  p.platformSkus = num(c.shopeeSkus);
  /* ⚠️ missingSample เป็น "ตัวอย่าง" ไม่ใช่ทั้งหมด (ตัวเทียบตัดไว้ 20)
      ⇒ ตัวนับ skipUnknown ต้องเอาเลขจริงมาจาก `missing` ไม่ใช่ความยาวของตัวอย่าง
      (การตัดตัวอย่างเป็นเรื่องการแสดงผล ห้ามให้ไปลดตัวนับ) */
  p.skipUnknown = num(c.missing);
  p.bucketsAddUp = p.same + p.wouldPush + p.skipNegative + p.skipUnknown === p.platformSkus;
  p.day = c.day;
  return p;
}

/** ── Lazada ──
 *  ⚠️ ใช้เฉพาะกองที่ **จับคู่ตรงตัวหรือด้วยสูตรชุด** เท่านั้น
 *     กอง "เดาว่าเป็นตัวเดียวกันจากรหัสฐาน" (matchedByBase) **ห้ามเอามาดัน**
 *     เพราะเป็นการเดา ดันผิดคือแก้ที่หน้าร้านลูกค้าไม่ได้
 */
async function lazadaPlan() {
  const { lazadaStockCompare } = await import("./lazada.mjs");
  const c = await lazadaStockCompare();
  /* 🔴 **ห้ามเช็ค `c.note` ตรงนี้อีก** (บั๊กที่เจอ 6 ก.ย. 2569)
      `note` ของ lazadaStockCompare คือ **คำอธิบายคอลัมน์ของผลที่สำเร็จ** ⇒ มีทุกรอบที่สำเร็จ
      เดิมเขียน `if (c.skip || c.note)` ⇒ **แผนดันสต็อก Lazada ไม่เคยถูกคำนวณเลยสักครั้ง**
      และคืนคำอธิบายคอลัมน์ออกไปเป็น "เหตุผลที่ข้าม" ซึ่งอ่านแล้วดูสมเหตุสมผลมาก
      **ไม่มีอะไรฟ้อง ไม่มี error ไม่มีเลขผิด** — จอขึ้นว่า "ข้าม" พร้อมเหตุผลยาวสวยงาม
      ⇒ บทเรียน: ตัวที่บอกว่า "ข้าม" ต้องอ่านง่ายพอที่คนจะเห็นว่าเหตุผลนั้น**ไม่ใช่เหตุผล** */
  if (c.skip) return { skip: c.skip };
  /* ⚠️ ตาข่ายกันบั๊กแบบเดิมกลับมา: ถ้าไม่มีโครงผลลัพธ์ที่ต้องใช้ ให้บอกตรง ๆ ว่าอ่านผลไม่ได้
      **ห้ามเดินต่อด้วยกองว่าง** เพราะจะได้แผน "ไม่ต้องดันอะไรเลย" ซึ่งดูเหมือนทุกอย่างตรงกันดี */
  if (!Array.isArray(c.diff))
    return { skip: "อ่านผลเทียบสต็อก Lazada ไม่ได้ (ไม่มีช่อง diff) — ไม่ใช่ 'ไม่มีอะไรต้องดัน'" };

  const exact = (c.diff || []).filter((d) => d.matchedAs === "ตรงตัว" || d.via === "สูตรชุด");
  const rows = exact.map((d) => ({
    sku: d.sku,
    name: d.name,
    platformQty: num(d.lazada ?? d.platform ?? d.available),
    coreQty: num(d.core),
    known: true,
  }));
  const p = planFrom(rows);
  p.platformSkus = num(c.lazadaSkus);
  p.skipUnknown = num(c.missing);

  /* 🔴 **แก้ 6 ก.ย. 2569 — เดิมมี 134 รหัสบน Lazada ที่ไม่อยู่ในกองไหนเลย**
      เจอตอนจะเริ่มดันสต็อกจริง: Shopee/TikTok ตัวตรวจตัวเองขึ้น true แต่ Lazada เป็น **null**
      (null = "ไม่ได้ตรวจ" ซึ่งเขียนไว้ตรงไปตรงมาดีแล้ว **แต่ไม่ได้แปลว่าปลอดภัย**)
      บวกมือแล้วขาด 134 ⇒ ถ้าดันของจริงตอนนั้น เราจะไม่รู้ว่าเกิดอะไรกับ 134 รหัสนั้น
      ⇒ ไล่จนครบ พบว่าเป็นคนละเรื่องสองเรื่องบวกกันพอดี:

      **① หน่วยผิด (101 รหัส)** — `oneToManyKeys` = จำนวน**รหัสในคลังเรา** (91)
         แต่ตัวหารคือ**รหัสบน Lazada** (1,968) ⇒ ต้องใช้ `oneToManySkus` (192)
         ⚠️ ชื่อคล้ายกัน ค่าใกล้กัน อยู่ติดกัน — แต่ตอบคนละคำถาม [[similar-name-other-unit]]

      **② ทับตัวเลขของตัวเอง (33 รหัส)** — เดิมเขียน `p.same = c.sameExact` **ทับ**
         ค่าที่ `planFrom` เพิ่งนับมา ⇒ 33 แถวที่ตัวเทียบบอกว่า "ต่าง" แต่พอคิดแผนจริงแล้ว
         **เท่ากัน** หายไปเงียบ ๆ · ตอนนี้บวกเข้า `same` และแยกให้เห็นที่ `sameOnRecheck`
      ⚠️ 33 แถวนี้แปลว่า **ตัวเทียบกับตัวคิดแผนมองคำว่า "ต่าง" ไม่ตรงกัน** — ยังไม่รู้ว่าเพราะอะไร
         (คนละช่องที่หยิบมาเทียบ? ปัดเศษ?) **ยังไม่ใช่เรื่องด่วนเพราะไม่ถูกดัน**
         แต่ต้องเห็นตัวเลข ไม่ใช่ให้มันหาย ⇒ ใครมาต่อจะได้รู้ว่ามีของค้างให้ตาม */
  /* ⚠️ **Shopee กับ TikTok เขียนทับ `p.same` แบบเดียวกันเป๊ะ — แต่ห้ามไปแก้ตาม**
      ตรวจแล้ว: ตัวตรวจ `bucketsAddUp` ของสองตัวนั้นขึ้น **true** อยู่
      ⇒ ถ้ามีของถูกทับหาย ผลบวกจะ**ขาด**เหมือนที่ Lazada เป็น — แต่ของมันลงตัวพอดี
      ⇒ แปลว่า `planFrom.same` ของสองตัวนั้นเป็น 0 อยู่แล้ว ไม่มีอะไรหาย
      ที่ Lazada พังเพราะ `bucketsAddUp` ถูกตั้งเป็น null = **ไม่มีตาข่าย** ไม่ใช่เพราะรูปโค้ด
      🔑 รูปโค้ดเหมือนกัน ไม่ได้แปลว่าผิดเหมือนกัน — grep เจอคือ "ที่ต้องดู" ไม่ใช่ "ที่ต้องแก้"
         [[same-shape-opposite-correctness]] · ไล่แก้ตามรูปแบบจะสร้างบั๊กใหม่เท่าที่แก้ได้ */
  const sameOnRecheck = num(p.same); // planFrom นับจาก rows ที่ส่งเข้าไปเท่านั้น
  p.same = num(c.sameExact) + sameOnRecheck;
  p.sameOnRecheck = sameOnRecheck;

  /* ⚠️ กองที่เดาจากรหัสฐาน + กองหลายรหัสชี้รหัสเดียว **ไม่นับเป็น "ดันได้"**
      บอกจำนวนออกไปให้เห็น ไม่ใช่เงียบ ๆ ตัดทิ้ง */
  p.excludedGuess = num(c.sameBase) + num(c.diffBase);
  p.excludedOneToMany = num(c.oneToManySkus);      // ⚠️ หน่วย = รหัสบน Lazada (ตัวที่ใช้บวก)
  p.excludedOneToManyKeys = num(c.oneToManyKeys);  // หน่วย = รหัสในคลังเรา (ไว้ดูเฉย ๆ ห้ามเอาไปบวก)

  /* ✅ ตอนนี้บวกได้ครบแล้ว ⇒ เลิกใช้ null · **ตัวตรวจต้องมีจริง ไม่ใช่ยอมแพ้แล้วบอกว่าไม่ได้ตรวจ**
      บวกไม่ครบเมื่อไหร่ = มีของหายระหว่างทาง ห้ามดันจนกว่าจะรู้ว่าหายไปไหน */
  p.bucketsAddUp =
    p.same + p.wouldPush + p.skipNegative + p.skipUnknown + p.excludedGuess + p.excludedOneToMany ===
    p.platformSkus;
  p.day = c.day;
  return p;
}

/** ── TikTok Shop ── (เขียนได้ 6 ก.ย. 2569 หลังเชื่อมร้านสำเร็จ)
 *  ⚠️ ตัวเทียบจะ **หยุดเองถ้าอ่านจำนวนคงเหลือไม่ได้** แล้วส่ง skip กลับมา
 *     ห้ามแก้ให้เดินต่อด้วยเลข 0 — ทุกรหัสจะดูเหมือน "ของหมด" แล้วแผนจะสั่งเปิดขายทั้งร้าน
 *  ⚠️ ตัวเลขที่ TikTok ให้คือของที่ **ลงขายอยู่ (ACTIVATE)** เท่านั้น
 *     "ไม่เจอ" จึงแปลว่า "ไม่ได้ลงขายอยู่ตอนนี้" ไม่ใช่ "ไม่เคยขายบน TikTok"
 */
async function tiktokPlan() {
  const { tiktokStockCompare } = await import("./tiktok-stock.mjs");
  const c = await tiktokStockCompare();
  /* ✅ เคยถูกอยู่แล้วเหมือน Shopee (เส้นสำเร็จไม่มี `note`) — ไม่ได้แก้เพราะพัง
      แต่ถอนชนวนให้เหมือนกันทั้งไฟล์: ต้นทางใช้ `skip` แล้ว เหลือเช็คทางเดียว */
  if (c.skip) return { skip: c.skip };
  if (!Array.isArray(c.diff))
    return { skip: "อ่านผลเทียบสต็อก TikTok ไม่ได้ (ไม่มีช่อง diff) — ไม่ใช่ 'ไม่มีอะไรต้องดัน'" };

  const rows = [
    ...(c.diff || []).map((d) => ({
      sku: d.sku, name: d.name, platformQty: num(d.tiktok), coreQty: num(d.core), known: true,
    })),
    ...(c.missingSample || []).map((m) => ({
      sku: m.sku, name: m.name, platformQty: null, coreQty: null, known: false,
    })),
  ];
  const p = planFrom(rows);
  // ตัวนับจริงมาจากตัวเทียบ ไม่ใช่จากตัวอย่างที่ตัดมาแสดง (บทเรียนเดียวกับฝั่ง Shopee)
  p.same = num(c.same);
  p.platformSkus = num(c.tiktokSkus);
  p.skipUnknown = num(c.missing);
  p.bucketsAddUp = p.same + p.wouldPush + p.skipNegative + p.skipUnknown === p.platformSkus;
  p.day = c.day;
  return p;
}

/** แผนการดันสต็อก — อ่านอย่างเดียวทั้งหมด
 *  @param platform "shopee" | "lazada" | "tiktok" | "all"
 */
export async function stockPushDryRun(o = {}) {
  const want = String(o.platform ?? "all").toLowerCase();
  const out = { mode: "ซ้อมอย่างเดียว — ไม่เขียนอะไรกลับแพลตฟอร์ม" };

  /* ⚠️ **ต้องวิ่งสามเจ้าพร้อมกัน ห้ามไล่ทีละเจ้า** (แก้ 6 ก.ย. 2569)
      แต่ละตัวกวาดรายการสินค้าทั้งร้านของแพลตฟอร์มนั้น (TikTok สูงสุด 25 หน้า × 100)
      เดิม `await` ต่อกันสามท่อน ⇒ เวลารวม = **ผลบวก** · Netlify ให้ฟังก์ชันรอผลแค่ **26 วินาที**
      ตอนมีสองเจ้ายังพอไหว วันที่ TikTok เชื่อมได้ (6 ก.ย. 2569) กลายเป็นสาม
      **โดยไม่มีอะไรเตือน** ⇒ ผลคือ 502 เปล่า ๆ ไม่บอกสาเหตุ
      ดู [[time-budget-is-shared]] — ของที่ "เร็วมาก" อันตรายกว่าของช้า
      เพราะไม่มีใครสงสัยว่ามันกำลังกินงบเวลาที่ใช้ร่วมกันอยู่

      ⚠️ ดัก error **รายเจ้าข้างใน** ไม่ใช่ครอบ `Promise.all` — เจ้าหนึ่งล่มต้องไม่ลากเจ้าอื่นตาย
        (กติกาเดียวกับ marketplace-listings.mjs)
      ⚠️ ไม่ขอเจ้าไหน = `undefined` **ไม่ใช่ `{}`** เพื่อไม่ให้จอเห็นคีย์ว่างแล้วอ่านว่า
        "ถามแล้วไม่มีของ" ทั้งที่ไม่ได้ถาม (three-states-not-two)

      ⚠️ **สถานะการเชื่อมต่อ TikTok ห้ามเขียนเป็นข้อความตายตัวอีก**
        ของเดิมเขียนไว้ว่า "ยังเชื่อมไม่ได้ — รอ TikTok ตรวจสอบพาร์ทเนอร์ (ยื่นแล้ว 5 ก.ย.)"
        พอเชื่อมสำเร็จเช้า 6 ก.ย. ประโยคนั้น **กลายเป็นเท็จทันทีโดยไม่มีอะไรฟ้อง**
        และจะโกหกต่อไปจนกว่าจะมีคนบังเอิญมาอ่าน (ดู [[stale-state-comments]])
        ⇒ ถามของจริงทุกครั้ง และแยกให้ชัดว่า **"เชื่อมไม่ได้" กับ "ยังไม่ได้เขียนตัววางแผน"
          เป็นคนละเรื่อง** — รวมเป็นข้อความเดียวเมื่อไหร่ คนอ่านจะไปแก้ผิดจุด */
  const guard = (e) => ({ error: String(e?.message || e).slice(0, 200) });
  const [sh, lz, tk] = await Promise.all([
    want === "shopee" || want === "all" ? shopeePlan().catch(guard) : undefined,
    want === "lazada" || want === "all" ? lazadaPlan().catch(guard) : undefined,
    want === "tiktok" || want === "all" ? tiktokPlan().catch(guard) : undefined,
  ]);
  if (sh !== undefined) out.shopee = sh;
  if (lz !== undefined) out.lazada = lz;
  if (tk !== undefined) out.tiktok = tk;

  out.safetyNote =
    "ห้ามดันรหัสที่คลังเราติดลบ (ติดลบ = ข้อมูลเราผิด ไม่ใช่ของหมด) · " +
    "ห้ามดันรหัสที่คลังไม่รู้จัก (ไม่รู้ ไม่เท่ากับ ศูนย์) · " +
    "ฝั่ง Lazada ตัดกองที่จับคู่ด้วยการเดารหัสฐานออกทั้งหมด เหลือเฉพาะที่ตรงตัวหรือมีสูตรชุด";
  out.readNote =
    "reopen = ของมีแต่ปิดขายอยู่ ดันแล้วได้เงินคืน · close = แพลตฟอร์มโชว์ว่ามีแต่เราไม่มี " +
    "ดันแล้วกันรับออเดอร์ที่ส่งไม่ได้ · สองอย่างนี้ผลตรงข้ามกัน อย่ารวมเป็นเลขเดียว";
  return out;
}
