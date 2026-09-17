// ตัวกวาดดันสต็อกอัตโนมัติ — สมุดสถานะราย (รหัส × ช่องทาง)
//
// 🎯 **ท่านประธานสั่ง 17 ก.ย. 2569**: "ปุ่มดันสต็อกของ ZORT ไม่เวิร์ค มันไม่ออโต้
//    ผมต้องมาคอยกด ผมต้องการให้มันออนไลน์ ออโต้ อัปเดตเอง"
//
// สิ่งที่วัดได้ก่อนเขียนไฟล์นี้ (ยิงของจริง 17 ก.ย. — ไม่ใช่การเดา):
//   · ตัวยิง Lazada **ทำงานได้จริง** — สมุดบันทึกมี 21 รายการยิงเข้า ไม่ถูกปฏิเสธเลย
//   · ยิงสำเร็จครั้งล่าสุด **11 ก.ย. 22:42** แล้วเงียบมา 6 วัน เพราะ**ไม่มีใครปลุกมัน**
//   · ตอนนั้น Lazada มี 42 รหัสที่เลขไม่ตรงกับคลัง (ขึ้น 41 · ลง 1 · ไม่มีตัวไหนต้องปิด/เปิดขาย)
//   · สูตรชุดในตัวคิดแผน **ถูกต้องแล้ว** — 03386 คงเหลือ 19,549 ⇒ 25.5T=766 · 29T=674 · 36T=543
//     (19549÷25.5=766.6 · ÷29=674.1 · ÷36=543.0) ลงตัวทุกตัว
//   ⇒ **เราไม่ได้ขาดเครื่องยนต์ เราขาดคนบิดกุญแจ** ไฟล์นี้คือกุญแจ
//
// ⛔ **ค่าเริ่มต้นคือ "ซ้อม" ไม่ยิงของจริง** — ต้องตั้ง env `STOCK_PUSH_AUTO=1` ถึงจะยิง
//    เหตุผล: กติกาของโครงการคือเดินคู่ขนานจนพิสูจน์ว่าตรงกันก่อนสับสวิตช์
//    โหมดซ้อมยังเขียน `push_state` ครบ ⇒ **จอสถานะเห็นความจริงได้ทันทีโดยยังไม่มีอะไรวิ่งออกนอก**
//
// ⚠️ ทำไมต้องมีสมุดสถานะ ไม่ใช่ดูจาก `stockpush/log` อย่างเดียว
//    สมุด log บอกว่า "รอบนั้นยิงอะไรไป" แต่ตอบไม่ได้ว่า **"รหัสนี้ถูกแตะครั้งสุดท้ายเมื่อไหร่"**
//    รหัสที่ถูกข้ามทุกรอบมาสามวันจะไม่โผล่ใน log เลยสักบรรทัด ⇒ **หายเงียบสนิท**
//    สมุดสถานะเก็บรายรหัส ⇒ ของที่ถูกข้ามมีตัวตน และขึ้นแดงได้

import { coreQuery, coreReady } from "./coredb.mjs";

/** งบเวลาต่อรอบ — Netlify ให้ฟังก์ชันตอบได้ 26 วินาที (ตามเวลา ~30) เผื่อขอบไว้ */
const งบเวลา = 18_000;
/** ห้าม **เริ่ม** ยิงก้อนใหม่หลังวินาทีนี้ (แก้ 17 ก.ย. 2569)
 *  เดิมเช็ค "เหลืองบ 18 วิไม่ถึง 5 วิ" = ต้องเริ่มก่อนวินาทีที่ 13 — แต่คิดแผนอย่างเดียวก็ 12–14 วิแล้ว
 *  ⇒ รอบที่แผนช้านิดเดียว **ไม่ยิงเลยเงียบ ๆ** (notFiredThisRound) · ตอนนี้ตัวยิงไม่คิดแผนซ้ำแล้ว
 *  ก้อนหนึ่ง (≤100 รหัส · Lazada ก้อนละ 20) + เขียนสมุด ใช้ไม่กี่วินาที ⇒ เริ่มได้ถึงวินาทีที่ 16 ยังจบก่อน 26 */
const เริ่มยิงได้ถึง = 16_000;

/** ยิงจริงหรือซ้อม — ไม่ตั้ง = ซ้อม (ตั้งใจ · กันเปิดโดยไม่ตั้งใจ แบบเดียวกับ NEXT_PUBLIC_COD) */
export const ยิงจริงอยู่ไหม = () => String(process.env.STOCK_PUSH_AUTO || "") === "1";

/** ตัวยิงที่มีอยู่จริง — **ช่องทางที่ไม่มีตัวยิงคิดจากตรงนี้** ไม่ใช่รายชื่อฝังตายตัว (CEO สั่ง 17 ก.ย. 2569)
 *  เพิ่มตัวยิงเจ้าใหม่ = เพิ่มบรรทัดเดียว แล้ว channelsWithoutWriter หายเองโดยไม่มีใครต้องไปแก้จอ */
export const ตัวยิง = {
  lazada: async () => (await import("./stock-push-live.mjs")).stockPushLive,
  shopee: async () => (await import("./stock-push-shopee.mjs")).shopeePushLive,
  tiktok: async () => (await import("./stock-push-tiktok.mjs")).tiktokPushLive,
};
export const ช่องทางทั้งหมด = ["lazada", "shopee", "tiktok"];

/** สวิตช์ยิงอัตโนมัติ **แยกต่อเจ้า** — Lazada ใช้ STOCK_PUSH_AUTO เดิม (พิสูจน์แล้ว)
 *  🔴 เจ้าใหม่ต้องมีสวิตช์ของตัวเอง ค่าเริ่มต้นปิด: STOCK_PUSH_AUTO=1 เปิดอยู่แล้ว ⇒ ถ้าใช้ตัวเดียวกัน
 *     วินาทีที่ deploy ตัวกวาดจะยิง Shopee/TikTok ทั้งกอง โดยยังไม่เคยลองยิงทีละน้อย */
export const ยิงจริงของ = (platform) =>
  platform === "lazada" ? ยิงจริงอยู่ไหม() : String(process.env[`STOCK_PUSH_AUTO_${String(platform).toUpperCase()}`] || "") === "1";

async function สร้างตาราง() {
  /* หนึ่งแถว = หนึ่ง (รหัส × ช่องทาง) — กติกาเดียวกับตัวนับคนเข้าเว็บ
     ห้ามเก็บรวมก้อนเดียวแล้วอ่านมาแก้เขียนกลับ สองรอบชนกันจะกินกันเอง */
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS push_state (
       sku TEXT NOT NULL,
       channel TEXT NOT NULL,
       planned_qty INTEGER,
       planned_at TEXT,
       pushed_qty INTEGER,
       pushed_at TEXT,
       push_result TEXT,
       verified_qty INTEGER,
       verified_at TEXT,
       skip_reason TEXT,
       skip_first_at TEXT,
       skip_last_at TEXT,
       skip_streak INTEGER NOT NULL DEFAULT 0,
       last_error TEXT,
       last_error_at TEXT,
       PRIMARY KEY (sku, channel))`
  );
  await coreQuery(
    `CREATE TABLE IF NOT EXISTS push_sweep_log (
       at TEXT PRIMARY KEY, channel TEXT, mode TEXT,
       planned INTEGER, fired INTEGER, pushed INTEGER, rejected INTEGER,
       skipped INTEGER, ms INTEGER, note TEXT)`
  );
}

/** เขียนแถวเป็นชุด — D1 อยู่ APAC ฟังก์ชันอยู่ US (286 ms ต่อคำขอ)
 *  ⇒ **ลดจำนวนรอบไป-กลับสำคัญกว่าลดขนาดคำขอ** ยัดหลายแถวในคำสั่งเดียวเสมอ */
/** 🔴 **D1 รับตัวแปรผูกค่าได้ไม่เกิน 100 ตัวต่อคำสั่ง** (ไม่ใช่ 999 แบบ SQLite ปกติ)
 *  เจอตอนยิงของจริงหลัง deploy 17 ก.ย.: ของเดิมใช้ 40 แถว × 15 คอลัมน์ = 600 ตัวแปร
 *  ⇒ `D1 400: too many SQL variables` ทั้งรอบ
 *  ⚠️ **ทดสอบบน SQLite ในเครื่องผ่านฉลุย** เพราะ SQLite ยอมถึง 999 — ต่างกันเงียบ ๆ
 *     ⇒ บทเรียน: ตัวจำลองที่ "ใจกว้างกว่าของจริง" ให้ผลเขียวที่แปลว่า "ยังไม่เจอ" ไม่ใช่ "ไม่มี"
 *  15 คอลัมน์ ⇒ ได้มากสุด 6 แถวต่อคำสั่ง (90 ตัวแปร) */
const แถวต่อคำสั่ง = 6;

async function เขียนเป็นชุด(แถว, กันเวลา = null) {
  if (!แถว.length) return { เขียนแล้ว: 0, ไม่ได้เขียน: 0 };
  const ต่อก้อน = แถวต่อคำสั่ง;
  let เขียนแล้ว = 0;
  for (let i = 0; i < แถว.length; i += ต่อก้อน) {
    /* ⚠️ D1 อยู่ APAC ฟังก์ชันอยู่ US ⇒ ~286 ms ต่อคำสั่ง
       6 แถวต่อคำสั่งแปลว่ารอบที่มีแถวเยอะจะกินเวลามาก ⇒ ต้องมีเบรก
       🔑 **หยุดแล้วต้องรายงานว่าเหลือกี่แถว ห้ามเงียบ** — ตัดทอนเงียบ ๆ
          จะอ่านได้ว่า "ครอบคลุมครบ" ทั้งที่เพิ่งทิ้งไป */
    if (typeof กันเวลา === "function" && กันเวลา()) {
      return { เขียนแล้ว, ไม่ได้เขียน: แถว.length - เขียนแล้ว };
    }
    const ก้อน = แถว.slice(i, i + ต่อก้อน);
    const ค่า = ก้อน.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
    const params = [];
    for (const r of ก้อน) {
      const ข้าม = r.skip_reason ?? null;
      params.push(
        r.sku, r.channel,
        r.planned_qty ?? null, r.planned_at ?? null,
        r.pushed_qty ?? null, r.pushed_at ?? null, r.push_result ?? null,
        r.verified_qty ?? null, r.verified_at ?? null,
        ข้าม,
        /* 🔴 **ต้องตั้งค่าอายุการถูกข้ามตั้งแต่แถวแรกที่แทรก ไม่ใช่รอรอบที่สอง**
           ของเดิมผมไม่ใส่สามคอลัมน์นี้ใน INSERT ⇒ รหัสที่ถูกข้ามตั้งแต่รอบแรก
           จะได้ skip_first_at = NULL แล้ว **ไม่มีวันเริ่มนับอายุ**
           ⇒ "ถูกข้ามมาสามวัน" ซึ่งเป็นสิ่งเดียวที่สมุดนี้มีไว้จับ จะตรวจไม่เจอเลย
           (เจอเองตอนไล่อ่านโค้ดตัวเองก่อน commit) */
        ข้าม ? (r.planned_at ?? null) : null,   // skip_first_at
        ข้าม ? (r.planned_at ?? null) : null,   // skip_last_at
        ข้าม ? 1 : 0,                            // skip_streak
        r.last_error ?? null, r.last_error_at ?? null
      );
    }
    /* ⚠️ `skip_streak` ต้อง **นับต่อจากของเดิม** ไม่ใช่เขียนทับ
       ถ้าเขียนทับเป็น 1 ทุกรอบ รหัสที่ถูกข้ามมาสามวันจะดูเหมือนเพิ่งถูกข้ามรอบแรก
       ⇒ ไม่มีวันขึ้นแดง ซึ่งคือสิ่งเดียวที่สมุดนี้มีไว้จับ
       และ `skip_first_at` ต้องคงค่าเดิมไว้ ⇒ ตอบได้ว่า "ถูกข้ามมานานแค่ไหน" */
    await coreQuery(
      `INSERT INTO push_state
         (sku,channel,planned_qty,planned_at,pushed_qty,pushed_at,push_result,
          verified_qty,verified_at,skip_reason,skip_first_at,skip_last_at,skip_streak,
          last_error,last_error_at)
       VALUES ${ค่า}
       ON CONFLICT(sku,channel) DO UPDATE SET
         planned_qty   = excluded.planned_qty,
         planned_at    = excluded.planned_at,
         pushed_qty    = COALESCE(excluded.pushed_qty,    push_state.pushed_qty),
         pushed_at     = COALESCE(excluded.pushed_at,     push_state.pushed_at),
         push_result   = COALESCE(excluded.push_result,   push_state.push_result),
         /* 🔴 **ยิงใหม่ต้องล้างการยืนยันเก่า** (แก้ 17 ก.ย. 2569 · gucut2)
            ของเดิม COALESCE เก็บ verified_at ของรอบก่อนไว้ ⇒ รหัสที่เคยยืนยันแล้วถูกยิงซ้ำ
            จะไม่ถูกหยิบไปพิสูจน์อีก (คำสั่งยืนยันเลือกเฉพาะ verified_at IS NULL)
            ⇒ รอบยิงใหม่ที่พังจะดูเหมือนยืนยันแล้วตลอดกาล · แถวที่ไม่ได้ยิงรอบนี้ (pushed_at ว่าง) คงของเดิม */
         verified_qty  = CASE WHEN excluded.pushed_at IS NOT NULL THEN NULL
                              ELSE COALESCE(excluded.verified_qty, push_state.verified_qty) END,
         verified_at   = CASE WHEN excluded.pushed_at IS NOT NULL THEN NULL
                              ELSE COALESCE(excluded.verified_at, push_state.verified_at) END,
         last_error    = excluded.last_error,
         last_error_at = excluded.last_error_at,
         skip_reason   = excluded.skip_reason,
         skip_first_at = CASE
             WHEN excluded.skip_reason IS NULL THEN NULL
             WHEN push_state.skip_reason IS NULL THEN excluded.planned_at
             ELSE COALESCE(push_state.skip_first_at, excluded.planned_at) END,
         skip_last_at  = CASE WHEN excluded.skip_reason IS NULL THEN NULL ELSE excluded.planned_at END,
         skip_streak   = CASE WHEN excluded.skip_reason IS NULL THEN 0 ELSE push_state.skip_streak + 1 END`,
      params
    );
    เขียนแล้ว += ก้อน.length;
  }
  return { เขียนแล้ว, ไม่ได้เขียน: 0 };
}

/** กวาดหนึ่งรอบสำหรับหนึ่งช่องทาง
 *  @param platform  ตอนนี้รองรับ "lazada" เท่านั้น — Shopee/TikTok **ยังไม่มีตัวยิง**
 *                   (ไม่ใช่ "มีแต่ปิดไว้" — ไม่มีคำสั่งเขียนอยู่จริง ๆ)
 *  @param opts.force  ยิงจริงแม้ env ไม่ได้ตั้ง (ใช้ตอนสั่งมือ ต้องมีรหัสหลังร้าน) */
/** ✍️ จดผลยิงมือ (POST ?stockpushlive=1) ลงสมุด push_state — ท่านประธานสั่ง 17 ก.ย. 2569
 *  เดิมเฉพาะตัวกวาดที่เขียนสมุด ⇒ ยิงมือ 18 รหัสคืนนั้น (Shopee 1 · TikTok 17) ยืนยันจากแผนแล้วแต่สมุดขึ้น เคยยิง 0
 *  ⇒ แถบ "อัปเดตออโต้" ไม่รู้ตลอด ทั้งที่ของลงจริง
 *  กติกา:
 *   · จดเฉพาะแถวที่ **ยิงออกไปจริง** (pushed / rejected) — not_sent ไม่ได้ออกนอกระบบ ห้ามนับเป็นข้อผิดพลาด
 *   · 🔴 **ล้าง verified_* ทุกครั้งที่ยิงใหม่** — ยิงใหม่ต้องพิสูจน์ใหม่ ไม่งั้นการยืนยันของรอบเก่าจะรับรองรอบนี้แทน
 *   · ไม่แตะช่องแผน/การข้าม (planned_*, skip_*) — เป็นของตัวกวาด
 *   · verified_at ยังตั้งได้ที่เดียว = รอบกวาดถัดไปพิสูจน์ว่ารหัสหายจากแผน (ตัวกวาดวิ่งทุกเจ้าแม้โหมดซ้อม)
 *   · 7 คอลัมน์ ⇒ ไม่เกิน 12 แถวต่อคำสั่ง (84 ตัวแปร · เพดาน D1 100) */
export async function จดยิงมือลงสมุด(platform, results, at = new Date().toISOString()) {
  const ออกจริง = (Array.isArray(results) ? results : []).filter((r) => r && (r.result === "pushed" || r.result === "rejected") && r.sku);
  if (!ออกจริง.length) return { เขียนแล้ว: 0 };
  await สร้างตาราง();
  let เขียนแล้ว = 0;
  for (let i = 0; i < ออกจริง.length; i += 12) {
    const ก้อน = ออกจริง.slice(i, i + 12);
    const params = [];
    for (const r of ก้อน) {
      const พัง = r.result === "rejected";
      params.push(String(r.sku), platform, r.to ?? null, at, r.result, พัง ? String(r.why || r.result).slice(0, 200) : null, พัง ? at : null);
    }
    await coreQuery(
      `INSERT INTO push_state (sku,channel,pushed_qty,pushed_at,push_result,last_error,last_error_at)
       VALUES ${ก้อน.map(() => "(?,?,?,?,?,?,?)").join(",")}
       ON CONFLICT(sku,channel) DO UPDATE SET
         pushed_qty    = excluded.pushed_qty,
         pushed_at     = excluded.pushed_at,
         push_result   = excluded.push_result,
         verified_qty  = NULL,
         verified_at   = NULL,
         last_error    = excluded.last_error,
         last_error_at = excluded.last_error_at`,
      params
    );
    เขียนแล้ว += ก้อน.length;
  }
  return { เขียนแล้ว };
}

export async function กวาดดันสต็อก({ platform = "lazada", force = false } = {}) {
  const เริ่ม = Date.now();
  const now = new Date().toISOString();

  if (!ตัวยิง[platform]) {
    /* 🔑 **ต้องตอบว่า "ทำไม่ได้" ไม่ใช่ "ทำแล้วได้ศูนย์"** — สองอย่างนี้หน้าตาเหมือนกันบนจอ
       แต่แปลคนละเรื่อง: ศูนย์ = ตรงกันหมดแล้ว · ทำไม่ได้ = ไม่รู้ว่าตรงไหม */
    return { skip: `ยังไม่มีตัวยิงสำหรับ ${platform}`, platform, at: now };
  }
  if (!coreReady()) return { skip: "ยังต่อฐานคลังเงาไม่ได้", platform, at: now };

  await สร้างตาราง();

  const { stockPushDryRun } = await import("./stock-push.mjs");
  const แผนทั้งหมด = await stockPushDryRun({ platform, full: true });
  /* ⏱️ จับเวลารายขั้น — 31.5 วิครั้งแรกไม่มีใครบอกได้ว่าหายไปตรงไหน ต้องเดาจากเลขรวม */
  const แผนคิดเมื่อ = Date.now();
  const ขั้น = { แผน_ms: แผนคิดเมื่อ - เริ่ม };
  const p = แผนทั้งหมด?.[platform];

  if (!p || p.skip) {
    return { skip: p?.skip || "คิดแผนไม่ได้", platform, at: now };
  }

  /* ⚠️ **ต้องมีรายการเต็ม ไม่ใช่ตัวอย่าง** — `pushSample` มีแค่ 25 แถว
     บั๊ก 12 ก.ย. 2569: ตัวพิสูจน์ตกไปใช้ pushSample แล้วตอบว่า "ผ่าน" ให้รหัสที่ไม่เคยถูกตรวจ
     (กฎ: เลขเพื่อการแสดงผล ห้ามใช้ตัดสินใจ) */
  if (!Array.isArray(p.push)) {
    return { skip: "ท่อไม่ส่งรายการเต็มมา — ปฏิเสธที่จะทำงานจากตัวอย่าง", platform, at: now };
  }

  const แถว = [];
  for (const x of p.push) {
    แถว.push({ sku: String(x.sku), channel: platform, planned_qty: x.to, planned_at: now, skip_reason: null });
  }
  /* กองที่ตั้งใจข้าม — **ต้องบันทึกด้วย ห้ามปล่อยหาย**
     ของที่ถูกข้ามอย่างถูกกฎ ก็ยังทำให้ลูกค้าสั่งของที่ไม่มีได้เหมือนกัน
     ⇒ ต้องมีตัวตนในสมุด แล้วขึ้นแดงเมื่อถูกข้ามนานเกินไป */
  const กองข้าม = [
    ["negative", p.skipNegativeFull],
    ["unknown", p.skipUnknownFull],
    ["conflict", p.skipConflictFull],
  ];
  for (const [เหตุ, รายการ] of กองข้าม) {
    for (const x of Array.isArray(รายการ) ? รายการ : []) {
      แถว.push({ sku: String(x.sku ?? x), channel: platform, planned_qty: null, planned_at: now, skip_reason: เหตุ });
    }
  }

  /* ── ยืนยันของที่ยิงไปรอบก่อน — **ฟรี ไม่ต้องยิง API เพิ่มสักครั้ง** ──
     🔑 `lazadaReadBack` พิสูจน์ด้วยหลักว่า "รหัสหายไปจากแผนสดหรือยัง"
        ซึ่งแผนสดรอบนี้เราคิดไปแล้วข้างบน ⇒ **รอบกวาดรอบถัดไปคือตัวพิสูจน์ในตัว**
        เรียก readBack ซ้ำจะเป็นการคิดแผนใหม่ทั้งชุดอีกรอบ (ยิง Lazada สด ~10 วิ) = เปลืองงบเวลาเปล่า
     ⚠️ ต้องกันด้วยกองที่ถูกข้าม: รหัสที่หายจากแผนเพราะ "ถูกข้าม" **ไม่ใช่รหัสที่ลงแล้ว**
        ไม่กันไว้ = ตอบว่าผ่านให้รหัสที่ไม่เคยถูกเทียบ (บั๊กเดิม 12 ก.ย. ในอีกหน้าตาหนึ่ง) */
  const ยังอยู่ในแผน = new Set(p.push.map((x) => String(x.sku)));
  const ถูกข้ามรอบนี้ = new Set(แถว.filter((r) => r.skip_reason).map((r) => r.sku));
  const รอยืนยัน = await coreQuery(
    `SELECT sku, pushed_qty FROM push_state
     WHERE channel = ? AND pushed_at IS NOT NULL AND verified_at IS NULL LIMIT 500`,
    [platform]
  );
  const ยืนยันได้ = [];
  for (const r of รอยืนยัน) {
    const sku = String(r.sku);
    if (ยังอยู่ในแผน.has(sku) || ถูกข้ามรอบนี้.has(sku)) continue;
    ยืนยันได้.push({ sku, qty: r.pushed_qty });
  }
  if (ยืนยันได้.length) {
    for (let i = 0; i < ยืนยันได้.length; i += 40) {
      const ก้อน = ยืนยันได้.slice(i, i + 40);
      await coreQuery(
        `UPDATE push_state SET verified_qty = pushed_qty, verified_at = ?
         WHERE channel = ? AND sku IN (${ก้อน.map(() => "?").join(",")})`,
        [now, platform, ...ก้อน.map((x) => x.sku)]
      );
    }
  }

  const ยิงจริง = force || ยิงจริงของ(platform);
  let ผลยิง = null;

  if (ยิงจริง && p.push.length) {
    /* ⚠️ **คิดแผนใหม่สดเสมอ ห้ามยิงตามเลขที่คนเห็นเมื่อห้านาทีก่อน** (กติกาเดิมของ stock-push-live)
       ตัวยิงคิดแผนเองข้างในอีกชั้น เราส่งแค่รายชื่อรหัสให้มันไปคิดสด
       ⚠️ **ตัวยิงรับครั้งละไม่เกิน 100 รหัส** (อ่านจากโค้ดจริง ไม่ใช่เดา) ⇒ ต้องแบ่งก้อน
          เกินงบเวลาเมื่อไหร่หยุดส่งก้อนใหม่ ที่เหลือรอบหน้าทำต่อ — ไม่มีอะไรต้องจบในรอบเดียว */
    const stockPushLive = await ตัวยิง[platform]();
    const ทั้งหมด = p.push.map((x) => String(x.sku));
    const รวม = { fired: 0, pushed: 0, rejected: 0, notSent: 0, rows: [], ก้อนที่ยิง: 0, ไม่ได้ยิง: 0 };

    const เริ่มยิง = Date.now();
    for (let i = 0; i < ทั้งหมด.length; i += 100) {
      if (Date.now() - เริ่ม > เริ่มยิงได้ถึง) {
        รวม.ไม่ได้ยิง = ทั้งหมด.length - i;
        break;
      }
      const ก้อน = ทั้งหมด.slice(i, i + 100);
      /* 🔑 ส่งแผนที่เพิ่งคิดข้างบนให้ใช้ซ้ำ — ตัวยิงเช็คอายุเองและยังผ่านด่านทุกด่าน (ดู แผนใช้ซ้ำได้ไม่เกิน_ms) */
      const r = await stockPushLive(
        { platform, skus: ก้อน },
        { แผนที่คิดแล้ว: { plan: แผนทั้งหมด, คิดเมื่อ: แผนคิดเมื่อ } }
      ).catch((e) => ({
        error: String(e?.message || e).slice(0, 200),
      }));
      if (r?.planSource) รวม.planSource = r.planSource;
      if (r?.error) { รวม.error = r.error; รวม.ไม่ได้ยิง = ทั้งหมด.length - i; break; }
      รวม.ก้อนที่ยิง += 1;
      รวม.fired += r.fired ?? 0;
      รวม.pushed += r.pushed ?? 0;
      รวม.rejected += r.rejected ?? 0;
      รวม.notSent += r.notSent ?? 0;
      /* 🔴 **ตัวยิงคืนผลรายตัวในคีย์ `results` ไม่ใช่ `rows`** (แก้ 17 ก.ย. 2569 หลังยิงจริงผ่าน 76/76 ตอน 15:16)
         `rows` มีเฉพาะในบันทึก stockpush/log · ของเดิมอ่าน `r.rows` ⇒ **ว่างทุกรอบ**
         ⇒ ไม่มีแถวไหนได้ pushed_at ⇒ รอบกวาดถัดไปยืนยันไม่ได้สักรหัส ⇒ `เคยยืนยัน` = 0 ถาวร
            ทั้งที่ 76 รหัสหายจากแผนแล้ว (ลงหน้าร้านจริง) = แถบ "อัปเดตออโต้" แดงตลอดกาลแม้ระบบทำงานถูก
         ⚠️ คลาสเดียวกับ "ชื่อคีย์คล้ายกัน ค่าหน้าตาเหมือนกัน" — ชุดทดสอบ stock-push-sweep.test.mjs ใช้คำตอบรูปจริงของตัวยิง */
      const ผลรายตัว = Array.isArray(r.results) ? r.results : Array.isArray(r.rows) ? r.rows : [];
      รวม.rows.push(...ผลรายตัว);
    }
    ผลยิง = รวม;
    ขั้น.ยิง_ms = Date.now() - เริ่มยิง;

    const ทีละรหัส = new Map(รวม.rows.map((r) => [String(r.sku), r]));
    for (const r of แถว) {
      const got = ทีละรหัส.get(r.sku);
      if (!got) continue;
      r.pushed_qty = got.to ?? null;
      r.pushed_at = now;
      r.push_result = got.result ?? null;
      /* 🔑 **"ยิงแล้วได้ 200" ยังไม่นับว่าสำเร็จ** — `verified_at` ตั้งได้ที่เดียวคือ
         ท่อนยืนยันข้างบน (รอบถัดไปพิสูจน์ว่ารหัสหายจากแผนจริง) **ห้ามตั้งตรงนี้เด็ดขาด**
         ตอบ 200 ไม่ได้แปลว่าปลายทางทำให้ — แถบ "อัปเดตออโต้" ทั้งแถบพังถ้าตั้งผิดจุดนี้ */
      if (got.result === "rejected" || got.result === "not_sent") {
        r.last_error = String(got.why || got.result).slice(0, 200);
        r.last_error_at = now;
      }
    }
  }

  /* 🔴 **แถวที่ยิงออกไปแล้ว ต้องลงสมุดเสมอ ห้ามผ่านตัวกันเวลา** (แก้ 17 ก.ย. 2569 หลังรอบยิงจริง 14:01)
     ของเดิมเขียนทุกแถวผ่าน `กันเวลา` ⇒ การยิงกินเวลาเกินงบ 18 วิไปก่อน ตัวกันเวลาจึงตัดทิ้งตั้งแต่ก้อนแรก
     ⇒ **เขียนสมุด 0 แถว** แต่ `push_sweep_log` ข้างล่างไม่มีตัวกัน จึงบันทึกว่า "ยิง 76 ถูกปฏิเสธ 76"
     ⇒ log กับสมุดรายรหัสแยกกันเงียบ ๆ: ของจริงยิงไป 76 · สมุดบอก `มีข้อผิดพลาด 0`
     กติกา: **การกระทำที่ออกนอกระบบไปแล้ว คือบันทึกที่ห้ามตัดทิ้งเพราะหมดเวลา**
     ⇒ แถวที่มี pushed_at (ยิงแล้ว ไม่ว่าผลอะไร) เขียนก่อน โดยไม่ส่งตัวกันเวลา
        แถวที่เหลือ (แผน/ข้าม ที่ไม่ได้ยิง) ยังใช้ตัวกันเวลาเหมือนเดิม — รอบหน้าเขียนซ้ำได้ ไม่เสียอะไร */
  const ยิงแล้ว = แถว.filter((r) => r.pushed_at);
  const ยังไม่ยิง = แถว.filter((r) => !r.pushed_at);
  ยังไม่ยิง.sort((a, b) => (a.skip_reason ? 1 : 0) - (b.skip_reason ? 1 : 0));
  const เริ่มเขียน = Date.now();
  const ผลเขียนยิง = await เขียนเป็นชุด(ยิงแล้ว, null);
  const ผลเขียนที่เหลือ = await เขียนเป็นชุด(ยังไม่ยิง, () => Date.now() - เริ่ม > งบเวลา);
  const ผลเขียน = {
    เขียนแล้ว: ผลเขียนยิง.เขียนแล้ว + ผลเขียนที่เหลือ.เขียนแล้ว,
    ไม่ได้เขียน: ผลเขียนยิง.ไม่ได้เขียน + ผลเขียนที่เหลือ.ไม่ได้เขียน,
  };
  const เขียนแล้ว = ผลเขียน.เขียนแล้ว;
  ขั้น.เขียนสมุด_ms = Date.now() - เริ่มเขียน;
  const ms = Date.now() - เริ่ม;

  await coreQuery(
    `INSERT INTO push_sweep_log (at,channel,mode,planned,fired,pushed,rejected,skipped,ms,note)
     VALUES (?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(at) DO NOTHING`,
    [
      now, platform, ยิงจริง ? "live" : "dry",
      p.push.length,
      ผลยิง ? (ผลยิง.fired ?? 0) : 0,
      ผลยิง ? (ผลยิง.pushed ?? 0) : 0,
      ผลยิง ? (ผลยิง.rejected ?? 0) : 0,
      แถว.length - p.push.length,
      ms,
      ผลยิง?.error ? String(ผลยิง.error).slice(0, 200) : null,
    ]
  );

  return {
    ok: true,
    platform,
    at: now,
    mode: ยิงจริง ? "ยิงจริง" : "ซ้อม — ยังไม่เขียนอะไรกลับแพลตฟอร์ม",
    planned: p.push.length,
    skipped: แถว.length - p.push.length,
    verifiedNow: ยืนยันได้.length, // ของที่ยิงรอบก่อน แล้วรอบนี้พิสูจน์ว่าลงจริงแล้ว
    stateRows: เขียนแล้ว,
    /* 🔑 ไม่ได้เขียนครบต้องบอกเสมอ — เงียบไว้ = จอจะอ่านว่า "บันทึกครบแล้ว" ทั้งที่ยังไม่ครบ
       (กฎ: ครอบไม่ครบ แล้วรายงานเหมือนครอบครบ — กับดักที่โครงการนี้เจอบ่อยที่สุด) */
    ...(ผลเขียน.ไม่ได้เขียน ? { stateRowsPending: ผลเขียน.ไม่ได้เขียน } : {}),
    ms,
    steps: ขั้น,
    ...(ผลยิง
      ? {
          planSource: ผลยิง.planSource ?? null,
          fired: ผลยิง.fired ?? 0,
          pushed: ผลยิง.pushed ?? 0,
          rejected: ผลยิง.rejected ?? 0,
          /* 🔑 **ต้องบอกด้วยว่ารอบนี้ยิงไม่หมดกี่ตัว** — ห้ามยุบเป็น "สำเร็จ n รายการ" เฉย ๆ
             ไม่บอก = คนอ่านเข้าใจว่าครอบคลุมครบ ทั้งที่เพิ่งตัดทิ้งเพราะหมดเวลา */
          ...(ผลยิง.ไม่ได้ยิง ? { notFiredThisRound: ผลยิง.ไม่ได้ยิง } : {}),
        }
      : {}),
    ...(ผลยิง?.error ? { pushError: ผลยิง.error } : {}),
  };
}

/** สรุปให้จอสถานะ — **อ่านอย่างเดียว เร็ว ไม่ยิงแพลตฟอร์ม**
 *  จอเรียกตัวนี้ตอนเปิดหน้าได้ (ต่างจาก ?stockpush=1 ที่ยิงสดและช้า ~10 วิ) */
export async function สถานะดันสต็อก() {
  if (!coreReady()) return { inconclusive: true, why: "ต่อฐานคลังเงาไม่ได้" };
  await สร้างตาราง();

  const [รอบล่าสุด] = await coreQuery(
    `SELECT at, channel, mode, planned, pushed, rejected, skipped, ms, note
     FROM push_sweep_log ORDER BY at DESC LIMIT 1`
  );
  /* นับตามอายุ — **ตัดสินจาก verified_at เท่านั้น ไม่ใช่ pushed_at**
     ⚠️ ค่าที่คิดจาก "เวลาปัจจุบัน" จะเก่าเงียบ ๆ ⇒ ส่ง timestamp ดิบไปด้วยให้จอคิดเอง
        แต่ **ผลนับต้องคิดที่ท่อ** ไม่ใช่ให้จอนับจากรายการที่ถูกตัดทอนมาแล้ว */
  const [นับ] = await coreQuery(
    /* 🔴 **ต้องมี "เคยยิง" คู่กับ "เคยยืนยัน" เสมอ** (เพิ่ม 17 ก.ย. 2569)
       ของเดิมมีแต่ "เคยยืนยัน" ⇒ ตอนมันค้างที่ 0 ทั้งที่ของลงจริงบน Lazada แล้ว
       **แยกไม่ออกเลยว่าสายขาดตรงไหน**: ไม่เคยยิง · ยิงแล้วไม่ถูกบันทึก · บันทึกแล้วแต่ไม่ถูกยืนยัน
       สามอย่างนี้หน้าตาเหมือนกันเป๊ะเมื่อมองผ่านตัวเลขเดียว และแก้คนละที่กันทั้งหมด
       ⇒ กฎ: ตัวเลขที่ใช้วินิจฉัย ต้องมีตัวเลขข้างเคียงที่แยกสาเหตุออกจากกันได้ */
    `SELECT COUNT(*) AS ทั้งหมด,
            SUM(CASE WHEN pushed_at IS NOT NULL THEN 1 ELSE 0 END) AS เคยยิง,
            MAX(pushed_at) AS ยิงล่าสุด,
            SUM(CASE WHEN verified_at IS NOT NULL THEN 1 ELSE 0 END) AS เคยยืนยัน,
            SUM(CASE WHEN skip_reason IS NOT NULL THEN 1 ELSE 0 END) AS กำลังถูกข้าม,
            SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) AS มีข้อผิดพลาด,
            MAX(verified_at) AS ยืนยันล่าสุด,
            MIN(CASE WHEN skip_reason IS NOT NULL THEN skip_first_at END) AS ถูกข้ามนานสุดตั้งแต่
     FROM push_state`
  );
  /* 📊 แยกรายช่องทาง (เพิ่ม 17 ก.ย. 2569 ตอนมีตัวกวาดสามเจ้า)
     ⚠️ ช่องบนสุด (lastSweep · counts) **รวมทุกเจ้า** — พอ Shopee กวาดซ้อม lastSweep จะเป็นรอบซ้อมของ Shopee
        ทั้งที่ Lazada ยิงจริงอยู่ ⇒ จอต้องอ่าน byChannel · ช่องบนสุดคงไว้ให้จอรุ่นเก่า */
  const รอบล่าสุดราย = await coreQuery(
    `SELECT l.at, l.channel, l.mode, l.planned, l.pushed, l.rejected, l.skipped, l.ms, l.note
     FROM push_sweep_log l
     JOIN (SELECT channel, MAX(at) AS at FROM push_sweep_log GROUP BY channel) m ON m.channel = l.channel AND m.at = l.at`
  );
  const นับราย = await coreQuery(
    `SELECT channel, COUNT(*) AS ทั้งหมด,
            SUM(CASE WHEN pushed_at IS NOT NULL THEN 1 ELSE 0 END) AS เคยยิง,
            MAX(pushed_at) AS ยิงล่าสุด,
            SUM(CASE WHEN verified_at IS NOT NULL THEN 1 ELSE 0 END) AS เคยยืนยัน,
            SUM(CASE WHEN skip_reason IS NOT NULL THEN 1 ELSE 0 END) AS กำลังถูกข้าม,
            SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) AS มีข้อผิดพลาด,
            MAX(verified_at) AS ยืนยันล่าสุด,
            MIN(CASE WHEN skip_reason IS NOT NULL THEN skip_first_at END) AS ถูกข้ามนานสุดตั้งแต่
     FROM push_state GROUP BY channel`
  );
  const byChannel = {};
  for (const ch of ช่องทางทั้งหมด) {
    const { channel: _c, ...counts } = นับราย.find((r) => r.channel === ch) || {};
    byChannel[ch] = {
      มีตัวยิง: Boolean(ตัวยิง[ch]),
      autoOn: ยิงจริงของ(ch),
      lastSweep: รอบล่าสุดราย.find((r) => r.channel === ch) || null,
      counts: Object.keys(counts).length ? counts : null,
    };
  }

  const ค้างนาน = await coreQuery(
    `SELECT sku, channel, skip_reason, skip_streak, skip_first_at, last_error
     FROM push_state WHERE skip_reason IS NOT NULL
     ORDER BY skip_first_at ASC LIMIT 20`
  );

  return {
    ok: true,
    autoOn: ยิงจริงอยู่ไหม(),
    /* ⚠️ `autoOn` บอกแค่ว่า **สวิตช์เปิดไหม** 🚫 ห้ามเอาไปทำแถบ "อัปเดตออโต้"
       แถบนั้นต้องวัดจาก `ยืนยันล่าสุด` เท่านั้น — สวิตช์เปิดค้างไว้แล้วระบบตายไปสามวัน
       ก็ยังเขียวตลอดกาล ซึ่งคือโรคที่สมุดนี้สร้างมาเพื่อกำจัด */
    lastSweep: รอบล่าสุด || null,
    counts: นับ || null,
    stuck: ค้างนาน,
    channelsWithoutWriter: ช่องทางทั้งหมด.filter((ch) => !ตัวยิง[ch]),
    byChannel,
  };
}
