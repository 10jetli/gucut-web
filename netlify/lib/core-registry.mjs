/* ทะเบียนบัญชีรับ-จำหน่ายเลื่อยโซ่ยนต์ · เก็บใน D1 (ฐานข้อมูลปิด)
 *
 * 🔴 นี่คือ **เอกสารตามกฎหมาย** ไม่ใช่ตารางสต็อกธรรมดา
 *    ผู้ถือทะเบียนคือ **หจก. นิวเวฟ ซันไชน์** (ผู้นำเข้า) ไม่ใช่ ศีตกาล เทรดดิ้ง (คนขาย)
 *    มีชื่อลูกค้า · เลขใบ ลซ.๒ · จังหวัด ⇒ **ห้ามโผล่ที่หน้าร้าน ห้ามเข้า git**
 *    เก็บที่ D1 เพราะปิดอยู่หลังรหัสแอดมินอยู่แล้ว (ต่างจากไฟล์ในรีโปที่ใครโคลนก็อ่านได้)
 *
 * 🔑 **กุญแจต้องมี `lot` เสมอ ห้ามใช้ซีเรียลเดี่ยว ๆ**
 *    ทะเบียนเลื่อย (ลซ.7/1) กับทะเบียนบาร์ (ลซ.7/2) **ใช้เลขซีเรียลชุดเดียวกัน**
 *    ของจริง: `45-7-67-00021` เป็นทั้ง **NEWWAVE F660** และ **บาร์ KINGKONG 25"**
 *    ⇒ ใช้ซีเรียลเป็นกุญแจเมื่อไหร่ สองแถวนี้ทับกัน **แล้วกู้กลับไม่ได้**
 *
 * 🛑 **ห้ามลงชื่อลูกค้าอัตโนมัติ — ท่านประธานสั่งเอง 25 ก.ย. 2569**
 *    *"ลซ1-ลซ2-ลซ3 อย่าเพิ่งลงชื่อลูกค้าอัตโนมัตินะ ผมจะบอกอีกทีว่าควรลงชื่อขั้นตอนไหน"*
 *    ⇒ ตอนนี้ไฟล์นี้ **อ่านอย่างเดียว + นำเข้าจากชีต** เท่านั้น
 *       ไม่มีอะไรเขียนช่อง `buyer` · `lz2` · `sold_at` จากการสั่งซื้อบนเว็บเลยสักเส้น
 *    ⚠️ วันที่จะทำ ต้องรอคำสั่งว่า **ขั้นไหน** ถึงลงชื่อ (ตอนกรอก ลซ.1 · ตอนได้ ลซ.2 · ตอนส่งของ)
 *       เพราะแต่ละขั้นมีความหมายทางกฎหมายต่างกัน — ลงผิดขั้นคือบันทึกเท็จในเอกสารราชการ
 *
 * ⚠️ ที่มาของข้อมูล: Google Sheets "บัญชีรับและจำหน่าย เลื่อยยนต์ และแผ่นบังคับโซ่"
 *    ท่านประธานสั่ง 25 ก.ย. 2569 ให้ **อ่านอย่างเดียว ไม่เขียนกลับ** และยังเป็นตัวจริง
 *    ตารางนี้เป็น "เงา" จนกว่าจะเดินคู่ขนานแล้วพิสูจน์ว่าตรงกัน (สูตรเดียวกับตอนปลด Shopify)
 */
import { coreQuery, coreReady } from "./coredb.mjs";
import { LICENSED } from "./licensed-stock.mjs";

/* ⚠️ **ตาราง `registry` ถูกสร้างที่ `coreInit()` ใน coredb.mjs** ไม่ใช่ที่นี่
      เพราะ `coreQuery` มีกลไกซ่อมตัวเอง: เจอ "ไม่มีคอลัมน์" แล้วเรียก `coreInit()` ให้
      ถ้าตารางนี้ไปสร้างแยกข้างนอก กลไกนั้นจะซ่อมตารางนี้ไม่ได้ ⇒ พังตอนเพิ่มคอลัมน์ในอนาคต */

/**
 * นำเข้าทั้งชุด — ลบของเดิมของล็อตนั้นแล้วเขียนใหม่ ⇒ **ยิงซ้ำได้ ไม่เบิ้ล**
 * ⚠️ จงใจไม่ใช้ UPSERT รายแถว เพราะถ้าแถวหายจากต้นทาง (ลบทิ้งในชีต) UPSERT จะทิ้งของเก่าค้างไว้
 *    ⇒ "ลบทั้งล็อตแล้วเขียนใหม่" คือวิธีเดียวที่สะท้อนต้นทางได้จริง
 */
export async function registryImport(rows) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  if (!Array.isArray(rows) || !rows.length) return { ok: false, error: "no rows" };
  const lots = [...new Set(rows.map((r) => Number(r.lot)))];
  for (const lot of lots) await coreQuery(`DELETE FROM registry WHERE lot = ?`, [lot]);

  let เขียน = 0;
  /* ⚠️ **D1 รับพารามิเตอร์ได้ 100 ตัวต่อคำสั่ง** — แถวละ 13 ช่อง ⇒ ได้สูงสุด 7 แถว/คำสั่ง
     เขียน 40 แถวแล้วตอบ HTTP 500 (เจอของจริง 25 ก.ย. 2569) · คำนวณจาก 13 ไม่ใช่ฝังเลข
     เพื่อว่าวันที่เพิ่มคอลัมน์ ขนาดชุดจะลดตามเอง ไม่ใช่ไปพังเงียบ ๆ */
  const ช่องต่อแถว = 13;
  const ต่อชุด = Math.max(1, Math.floor(100 / ช่องต่อแถว));
  for (let i = 0; i < rows.length; i += ต่อชุด) {
    const ชุด = rows.slice(i, i + ต่อชุด);
    const ช่อง = ชุด.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
    const ค่า = [];
    for (const r of ชุด) {
      ค่า.push(Number(r.lot), String(r.kind || ""), String(r.serial || ""),
        r.seq == null ? null : Number(r.seq), r.license || null, r.spec || null,
        r.model || null, r.received || null, r.sold_at || null, r.buyer || null,
        r.lz2 || null, r.lz2_date || null, r.province || null);
    }
    await coreQuery(
      `INSERT INTO registry (lot,kind,serial,seq,license,spec,model,received,sold_at,buyer,lz2,lz2_date,province)
       VALUES ${ช่อง}`, ค่า);
    เขียน += ชุด.length;
  }
  return { ok: true, lots: lots.length, rows: เขียน };
}

/* ── จับคู่ "ชื่อในทะเบียน" กับ "รหัสสินค้าในเว็บ" ──
   ⚠️ สะกดคนละแบบโดยสิ้นเชิง ทะเบียนเขียน `NEWWAVE/8800 SUPER-S` เว็บใช้ `NW 8800`
      และบาร์หนึ่งขนาดในทะเบียนตรงกับ **หลายตัวเลือก** ในเว็บ (ตัวเลือกใช้ของกองเดียวกัน)
   🚫 ห้ามเดาด้วยการตัดคำ — ชื่อรุ่นมีคำของรุ่นอื่นปนอยู่ (`F288 XP` มีคำว่า `F288`)
      ต้องจับคู่แบบตรงตัวเท่านั้น */
const เลื่อยเป็นรหัส = {
  "NEWWAVE F250": "F 250", "NEWWAVE F361": "F 361", "NEWWAVE F381": "F 381",
  "NEWWAVE F440": "F 440", "NEWWAVE F288 XP": "F 288", "NEWWAVE F070": "F 070",
  "NEWWAVE F660": "F 660",
  "NEWWAVE/8800 SUPER-S": "NW 8800", "NEWWAVE/9800 SUPER RPO": "NW 9800",
};
const บาร์เป็นรหัส = {
  "NEWWAVE 16": ["Bar NW 16"], "NEWWAVE 18": ["Bar NW 18"],
  "NEWWAVE 20": ["Bar NW 20"], "NEWWAVE 22": ["Bar NW 22"],
  "NEWWAVE 24": ["Bar NW 24-7800", "Bar NW 24-9800"],
  "NEWWAVE 28": ["Bar NW 28-7800", "Bar NW 28-8800"],
  "NEWWAVE 30": ["Bar NW 30-9800"],
  "NEWWAVE/8800 SUPER-S 28": ["Bar NW 28-7800", "Bar NW 28-8800"],
  "NEWWAVE/9800 SUPER RPO 30": ["Bar NW 30-9800"],
  "KINGKONG 16": ["Bar KK 16"], "KINGKONG 18": ["Bar KK 18"],
  "KINGKONG 25": ["Bar KK 25-7800", "Bar KK 25-381"],
  "KINGKONG 30": ["Bar KK 30-7800", "Bar KK 30-381", "Bar KK 30-070"],
  "KINGKONG 33": ["Bar KK 33-070"],
  "KINGKONG 36": ["Bar KK 36-381", "Bar KK 36-070"],
  "KINGKONG 42": ["Bar KK 42-381"], "KINGKONG 48": ["Bar KK 48-381"],
};

/**
 * สรุปทะเบียน + เทียบกับจำนวนที่เว็บเสิร์ฟอยู่จริง
 * 🚫 **ไม่มี ZORT ในจอนี้** — ท่านประธานสั่ง 25 ก.ย. 2569 "ตัด zort ออกได้เลย มันทำไม่ได้"
 *    (พิสูจน์แล้วว่า ZORT มีซีเรียลที่ว่ายังมีของ ทั้งที่ทะเบียนบอกขายไปแล้ว)
 */
export async function registrySummary() {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const แถว = await coreQuery(
    `SELECT kind, spec, model, COUNT(*) AS total,
            SUM(CASE WHEN sold_at IS NULL OR sold_at = '' THEN 1 ELSE 0 END) AS left_
       FROM registry GROUP BY kind, spec, model ORDER BY kind, spec, model`) || [];
  /* 🔑 **ต้องรวมกลุ่มแบบเดียวกับที่เว็บนับ ไม่งั้นเทียบ "ส่วนย่อย" กับ "ยอดรวม"**
     ทะเบียนแยกบาร์ 28" เป็นสองล็อต (`NEWWAVE` 9 แผ่น · `NEWWAVE/8800 SUPER-S` 10 แผ่น)
     แต่เว็บมีตัวเลือกเดียวที่ถือของทั้ง 19 แผ่น ⇒ ไม่ยุบยี่ห้อก่อน จะขึ้น "ไม่ตรง" ทั้งที่ตรง
     (เจอของจริง 25 ก.ย. 2569 — ขึ้นไม่ตรง 4 รายการ ทั้งที่ยอดรวมถูกทุกตัว)
     ⇒ ตัดส่วนขยายหลัง `/` ทิ้ง เหลือแค่ตระกูลยี่ห้อ (NEWWAVE · KINGKONG) */
  const ตระกูล = (v) => String(v || "").split("/")[0].trim();
  const รวมกลุ่ม = new Map();
  for (const x of แถว) {
    const ชื่อ = x.kind === "saw" ? String(x.model || "")
                                  : `${ตระกูล(x.spec)} ${String(x.model || "").trim()}`.trim();
    const คีย์ = `${x.kind}|${ชื่อ}`;
    const เดิม = รวมกลุ่ม.get(คีย์) || { kind: x.kind, ชื่อ, total: 0, left_: 0 };
    เดิม.total += Number(x.total || 0);
    เดิม.left_ += Number(x.left_ || 0);
    รวมกลุ่ม.set(คีย์, เดิม);
  }
  const out = [];
  for (const x of [...รวมกลุ่ม.values()].sort((a, b) => (a.kind + a.ชื่อ).localeCompare(b.kind + b.ชื่อ, "th"))) {
    const เหลือ = Number(x.left_ || 0);
    const ชื่อ = x.ชื่อ;
    const รหัส = x.kind === "saw"
      ? (เลื่อยเป็นรหัส[ชื่อ] ? [เลื่อยเป็นรหัส[ชื่อ]] : [])
      : (บาร์เป็นรหัส[ชื่อ] || []);
    /* เว็บให้เลขเดียวกันกับทุกตัวเลือกของขนาดนั้น (ของกองเดียวกัน)
       ⇒ เอาค่าแรกที่หาเจอ ไม่ใช่ผลรวม — บวกกันจะได้เกินจริง */
    let เว็บ = null;
    for (const s of รหัส) {
      const n = LICENSED[s];
      if (typeof n === "number") { เว็บ = n; break; }
    }
    out.push({
      ชนิด: x.kind === "saw" ? "เลื่อย" : "บาร์",
      ชื่อ, ทั้งหมด: Number(x.total || 0), ทะเบียนเหลือ: เหลือ,
      รหัสสินค้า: รหัส, เว็บโชว์: เว็บ,
      ตรงกัน: เว็บ === null ? null : เว็บ === เหลือ,
    });
  }
  const นับ = (k) => out.filter((x) => x.ชนิด === k).reduce((a, b) => a + b.ทะเบียนเหลือ, 0);
  return {
    ok: true,
    รวม: { เลื่อยเหลือ: นับ("เลื่อย"), บาร์เหลือ: นับ("บาร์") },
    ไม่ตรง: out.filter((x) => x.ตรงกัน === false).length,
    ยังไม่ได้จับคู่: out.filter((x) => x.ตรงกัน === null).length,
    รายการ: out,
  };
}

/**
 * ลบทั้งล็อต — ใช้ล้างของทดสอบ หรือล็อตที่ถูกยกเลิก
 * ⚠️ ต้องระบุเลขล็อตเจาะจงเสมอ **ไม่มีทางลบทั้งตารางด้วยคำสั่งเดียว** โดยตั้งใจ
 *    (เอกสารตามกฎหมาย — ลบพลาดแล้วต้องนำเข้าใหม่จากชีต ซึ่งรู้ตัวช้า)
 */
export async function registryDeleteLot(lot) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const n = Number(lot);
  if (!Number.isInteger(n)) return { ok: false, error: "ต้องระบุเลขล็อตเป็นจำนวนเต็ม" };
  const ก่อน = await coreQuery(`SELECT COUNT(*) AS n FROM registry WHERE lot = ?`, [n]) || [];
  await coreQuery(`DELETE FROM registry WHERE lot = ?`, [n]);
  return { ok: true, lot: n, ลบไป: Number(ก่อน[0]?.n || 0) };
}

/** รายการซีเรียลของรุ่น/ขนาดหนึ่ง — ไว้ดูว่าใบไหนขายแล้ว ใบไหนยังอยู่ */
export async function registryRows({ kind, model, soldOnly, limit = 200, offset = 0 } = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const where = [], args = [];
  if (kind) { where.push("kind = ?"); args.push(kind); }
  if (model) { where.push("model = ?"); args.push(model); }
  if (soldOnly) where.push("sold_at IS NOT NULL AND sold_at <> ''");
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const lim = Math.min(500, Math.max(1, Number(limit) || 200));
  const off = Math.max(0, Number(offset) || 0);
  const rows = await coreQuery(
    `SELECT lot, kind, serial, seq, license, spec, model, received,
            sold_at, buyer, lz2, lz2_date, province
       FROM registry ${w} ORDER BY lot, seq LIMIT ? OFFSET ?`, [...args, lim, off]) || [];
  const c = await coreQuery(`SELECT COUNT(*) AS n FROM registry ${w}`, args) || [];
  return { ok: true, total: Number(c[0]?.n || 0), rows };
}
