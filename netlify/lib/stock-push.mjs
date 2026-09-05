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
  if (c.skip || c.note) return { skip: c.skip || c.note };

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
  if (c.skip || c.note) return { skip: c.skip || c.note };

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
  p.same = num(c.sameExact);
  p.skipUnknown = num(c.missing);
  /* ⚠️ กองที่เดาจากรหัสฐาน + กองหลายรหัสชี้รหัสเดียว **ไม่นับเป็น "ดันได้"**
      บอกจำนวนออกไปให้เห็น ไม่ใช่เงียบ ๆ ตัดทิ้ง */
  p.excludedGuess = num(c.sameBase) + num(c.diffBase);
  p.excludedOneToMany = num(c.oneToManyKeys);
  p.bucketsAddUp = null; // ตัวหารคนละชุดกับ Shopee — ไม่บังคับให้บวกลงตัว แต่ต้องบอกว่าไม่ได้ตรวจ
  p.day = c.day;
  return p;
}

/** แผนการดันสต็อก — อ่านอย่างเดียวทั้งหมด
 *  @param platform "shopee" | "lazada" | "all"
 */
export async function stockPushDryRun(o = {}) {
  const want = String(o.platform ?? "all").toLowerCase();
  const out = { mode: "ซ้อมอย่างเดียว — ไม่เขียนอะไรกลับแพลตฟอร์ม" };

  if (want === "shopee" || want === "all") {
    out.shopee = await shopeePlan().catch((e) => ({ error: String(e?.message || e).slice(0, 200) }));
  }
  if (want === "lazada" || want === "all") {
    out.lazada = await lazadaPlan().catch((e) => ({ error: String(e?.message || e).slice(0, 200) }));
  }
  out.tiktok = { skip: "ยังเชื่อมไม่ได้ — รอ TikTok ตรวจสอบพาร์ทเนอร์ (ยื่นแล้ว 5 ก.ย. 2569)" };

  out.safetyNote =
    "ห้ามดันรหัสที่คลังเราติดลบ (ติดลบ = ข้อมูลเราผิด ไม่ใช่ของหมด) · " +
    "ห้ามดันรหัสที่คลังไม่รู้จัก (ไม่รู้ ไม่เท่ากับ ศูนย์) · " +
    "ฝั่ง Lazada ตัดกองที่จับคู่ด้วยการเดารหัสฐานออกทั้งหมด เหลือเฉพาะที่ตรงตัวหรือมีสูตรชุด";
  out.readNote =
    "reopen = ของมีแต่ปิดขายอยู่ ดันแล้วได้เงินคืน · close = แพลตฟอร์มโชว์ว่ามีแต่เราไม่มี " +
    "ดันแล้วกันรับออเดอร์ที่ส่งไม่ได้ · สองอย่างนี้ผลตรงข้ามกัน อย่ารวมเป็นเลขเดียว";
  return out;
}
