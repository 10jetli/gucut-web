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

/** งบเวลาต่อรอบ — Netlify ให้ฟังก์ชันตอบได้ 26 วินาที เผื่อขอบไว้ */
const งบเวลา = 18_000;

/** ยิงจริงหรือซ้อม — ไม่ตั้ง = ซ้อม (ตั้งใจ · กันเปิดโดยไม่ตั้งใจ แบบเดียวกับ NEXT_PUBLIC_COD) */
export const ยิงจริงอยู่ไหม = () => String(process.env.STOCK_PUSH_AUTO || "") === "1";

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
         verified_qty  = COALESCE(excluded.verified_qty,  push_state.verified_qty),
         verified_at   = COALESCE(excluded.verified_at,   push_state.verified_at),
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
export async function กวาดดันสต็อก({ platform = "lazada", force = false } = {}) {
  const เริ่ม = Date.now();
  const now = new Date().toISOString();

  if (platform !== "lazada") {
    /* 🔑 **ต้องตอบว่า "ทำไม่ได้" ไม่ใช่ "ทำแล้วได้ศูนย์"** — สองอย่างนี้หน้าตาเหมือนกันบนจอ
       แต่แปลคนละเรื่อง: ศูนย์ = ตรงกันหมดแล้ว · ทำไม่ได้ = ไม่รู้ว่าตรงไหม */
    return { skip: `ยังไม่มีตัวยิงสำหรับ ${platform}`, platform, at: now };
  }
  if (!coreReady()) return { skip: "ยังต่อฐานคลังเงาไม่ได้", platform, at: now };

  await สร้างตาราง();

  const { stockPushDryRun } = await import("./stock-push.mjs");
  const แผนทั้งหมด = await stockPushDryRun({ platform, full: true });
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

  const ยิงจริง = force || ยิงจริงอยู่ไหม();
  let ผลยิง = null;

  if (ยิงจริง && p.push.length) {
    /* ⚠️ **คิดแผนใหม่สดเสมอ ห้ามยิงตามเลขที่คนเห็นเมื่อห้านาทีก่อน** (กติกาเดิมของ stock-push-live)
       ตัวยิงคิดแผนเองข้างในอีกชั้น เราส่งแค่รายชื่อรหัสให้มันไปคิดสด
       ⚠️ **ตัวยิงรับครั้งละไม่เกิน 100 รหัส** (อ่านจากโค้ดจริง ไม่ใช่เดา) ⇒ ต้องแบ่งก้อน
          เกินงบเวลาเมื่อไหร่หยุดส่งก้อนใหม่ ที่เหลือรอบหน้าทำต่อ — ไม่มีอะไรต้องจบในรอบเดียว */
    const { stockPushLive } = await import("./stock-push-live.mjs");
    const ทั้งหมด = p.push.map((x) => String(x.sku));
    const รวม = { fired: 0, pushed: 0, rejected: 0, notSent: 0, rows: [], ก้อนที่ยิง: 0, ไม่ได้ยิง: 0 };

    for (let i = 0; i < ทั้งหมด.length; i += 100) {
      if (งบเวลา - (Date.now() - เริ่ม) < 5000) {
        รวม.ไม่ได้ยิง = ทั้งหมด.length - i;
        break;
      }
      const ก้อน = ทั้งหมด.slice(i, i + 100);
      const r = await stockPushLive({ platform, skus: ก้อน }).catch((e) => ({
        error: String(e?.message || e).slice(0, 200),
      }));
      if (r?.error) { รวม.error = r.error; รวม.ไม่ได้ยิง = ทั้งหมด.length - i; break; }
      รวม.ก้อนที่ยิง += 1;
      รวม.fired += r.fired ?? 0;
      รวม.pushed += r.pushed ?? 0;
      รวม.rejected += r.rejected ?? 0;
      รวม.notSent += r.notSent ?? 0;
      if (Array.isArray(r.rows)) รวม.rows.push(...r.rows);
    }
    ผลยิง = รวม;

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

  /* แถวที่วางแผนจะดันสำคัญกว่าแถวที่ถูกข้าม ⇒ เขียนก่อน
     เวลาหมดกลางทางจะได้เหลือของที่สำคัญน้อยกว่าไว้รอบหน้า */
  แถว.sort((a, b) => (a.skip_reason ? 1 : 0) - (b.skip_reason ? 1 : 0));
  const ผลเขียน = await เขียนเป็นชุด(แถว, () => Date.now() - เริ่ม > งบเวลา);
  const เขียนแล้ว = ผลเขียน.เขียนแล้ว;
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
    ...(ผลยิง
      ? {
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
    `SELECT COUNT(*) AS ทั้งหมด,
            SUM(CASE WHEN verified_at IS NOT NULL THEN 1 ELSE 0 END) AS เคยยืนยัน,
            SUM(CASE WHEN skip_reason IS NOT NULL THEN 1 ELSE 0 END) AS กำลังถูกข้าม,
            SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) AS มีข้อผิดพลาด,
            MAX(verified_at) AS ยืนยันล่าสุด,
            MIN(CASE WHEN skip_reason IS NOT NULL THEN skip_first_at END) AS ถูกข้ามนานสุดตั้งแต่
     FROM push_state`
  );
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
    channelsWithoutWriter: ["shopee", "tiktok"],
  };
}
