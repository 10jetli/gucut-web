// คลังเงา GUCUT Core — จอ "รายการขาย" อ่านจากฐานของเราเอง (ไม่แตะ ZORT เลย)
//
// จอนี้คือตัวแทนหน้า "รายการขาย" ของ ZORT ซึ่งเป็นหน้าที่ร้านเปิดบ่อยที่สุด
// หน้าเดิมใน admin.gucut.com (/orders · /sales) ยิงไป ZORT ตรง ๆ — ตัด ZORT เมื่อไหร่จอเปล่าทันที
// ตัวนี้อ่านจาก D1 ล้วน จึงเป็นจอแรกที่ "อยู่ได้โดยไม่มี ZORT"
//
// ⚠️ อ่านอย่างเดียวทั้งไฟล์ — ห้ามเพิ่มคำสั่งเขียนลงมาปนที่นี่
//    ระยะนี้คลังเงายังเป็นเงา ข้อมูลจริงคือ ZORT · เขียนได้เมื่อไหร่ค่อยแยกไฟล์ใหม่
// ⚠️ ค่าจากผู้ใช้ผูกด้วย ? เสมอ (ไม่ใช่ esc()) — ตัวเลขน้อย ไม่ชนเพดาน ~100 params ของ D1
//    ต่างจากตัว sync ที่ยัดทีละร้อยแถวจนต้องฝังค่า
import { coreQuery, coreReady } from "./coredb.mjs";
import { readStatus, groupsFromCounts } from "./order-status.mjs";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ชื่อร้านสำหรับโชว์ — ท่อเป็นคนบอก ไม่ใช่ให้จอแปลรหัส z1/z2 เอง
   ⚠️ ยังมีถ้อยคำแบบนี้เขียนซ้ำอยู่ใน core.mjs อีก 2 ที่ และ **สะกดไม่เหมือนกันสักที่**
      ("ceojet (ยังไม่เข้าภาษี)" · "ceojet (หน้าร้าน POS)") ⇒ จอเดียวกันอาจเห็นสองชื่อ
      ที่นี่คือตัวกลางตัวแรก · ย้ายอีกสองที่มาใช้ตัวนี้เมื่อไหร่ก็ได้ ยังไม่ย้ายเพราะนอกขอบเขตงานนี้
   ⚠️ รหัสที่ไม่รู้จักต้องคืนรหัสนั้นกลับไป **ห้ามคืน null หรือชื่อร้านใดร้านหนึ่ง**
      ร้านที่สามโผล่มาแล้วได้ชื่อร้านแรก = เลขไปกองผิดร้านโดยไม่มีอะไรฟ้อง */
export const STORES = {
  z1: { name: "ศีตกาล เทรดดิ้ง", note: "ตัวที่คิดภาษี" },
  z2: { name: "ceojet", note: "หน้าร้าน POS · ยังไม่เข้าภาษี" },
};
export const storeName = (src) => STORES[String(src)]?.name ?? String(src ?? "-");

const CANCEL_SQL =
  `status NOT LIKE '%cancel%' AND status NOT LIKE '%void%' AND status NOT LIKE '%ยกเลิก%'`;

/* ⚠️ **ธงเตือน "เลขบนจอนี้ยังเชื่อไม่ได้"** — กลไกเดียวกับ marketplacesUnreliable
    ที่พิสูจน์แล้ววันนี้ว่าใช้ได้ (ใส่ตอนไม่แน่ใจ · ปลดตอนยืนยันได้ · จอไม่ต้องรู้จักอะไรเลย)
    **ตั้งเป็น null เมื่อยืนยันเสร็จ แล้วจอหยุดเตือนเองโดยไม่ต้องมีใครจำ**
    ห้ามให้ฝั่งจอเขียนข้อความนี้ตายตัว ไม่งั้นจะกลายเป็นข้อความค้างอีกใบ */
/* ⚠️ **ตัวเลขทุกตัวในข้อความต้องมีขอบเขตกำกับ** — โดนมาแล้ว 3 ครั้งในวันเดียว (4 ก.ย. 2569)
    1,926 vs 319 (สินค้าที่เชื่อมต่อ vs ลงขายอยู่) · 12,196 vs 12,002 (จอ ZORT vs API)
    · 187 vs 17 (ทั้งกระจก vs กรอบ 3 เดือนบนแท็บ)
    **ทุกครั้งเลขทั้งสองตัวถูกในขอบเขตของตัวเอง** และทุกครั้งเสียเวลาไล่หาของที่ไม่ได้หาย
    ⇒ เขียนขอบเขตทุกครั้ง ไม่ใช่เฉพาะตอนที่เลขต่างกันเยอะ —
      **ตอนที่มันบังเอิญใกล้กัน อันตรายกว่า เพราะจะปิดการสอบสวนไปเลย** */
/* ⚠️ **ข้อความที่ส่งให้จอต้องเป็นตัวหนังสือล้วน ห้ามใส่มาร์กดาวน์** (ฝั่งจอทักไว้ 4 ก.ย. 2569)
    จอวาดตามที่ได้รับตรง ๆ ⇒ ใส่ ** ไป คนใช้เห็นดอกจัน 4 ตัวจริง ๆ ไม่ใช่ตัวหนา
    และ **จะไม่ทำให้จอแปลงมาร์กดาวน์** เพราะ ① เปิดช่องให้ข้อความจากท่อฉีด HTML เข้าจอ
    ② กลายเป็นข้อตกลงใหม่ที่ต้องจำว่าท่อไหนส่งมาร์กดาวน์ได้บ้าง
    ⇒ กติกาง่ายกว่าคือ **ท่อส่งข้อความ จอวาดตามนั้น** */
/* ⚠️ **ตรวจแล้วกระจกเชื่อถือได้ — ธงจึงเป็น null** (4 ก.ย. 2569)
    เทียบกับ ZORT **สองทาง ทีละเดือน ตลอดทั้งปี** (ต.ค. 68 · ม.ค. · เม.ย. · มิ.ย. · ส.ค.-ก.ย. 69):
      ใบที่ ZORT มีแต่กระจกไม่มี   **0 ทุกเดือน**
      สถานะออเดอร์ไม่ตรงกัน        **0 ทุกเดือน**
      สถานะจ่ายเงินไม่ตรงกัน       0 (หลังกวาดย้อนหลัง — เดิมค้างเฉพาะเดือนที่อยู่นอกหน้าต่างซิงก์)
      ใบที่กระจกมีแต่ ZORT ไม่มี   **0 ทุกเดือน**
    ⇒ ตัวเลขบนแท็บที่นับจากกระจก **ใช้ตัดสินใจได้**

    ⚠️ **สิ่งที่ยังอธิบายไม่ได้ และตั้งใจไม่เอามาเป็นเหตุผลเตือน**
    กระจกนับใบที่ยังไม่จบทั้งปีได้ 193 · การ์ดหน้าแรก ZORT รวมได้ 156 (24 + 132)
    ต่างกัน 37 ใบ **แต่พิสูจน์แล้วว่าไม่ใช่เพราะกระจกผิด** (ตรงกับ ZORT ทุกใบทุกเดือน)
    ⇒ เหลือความเป็นไปได้ว่าการ์ดนั้นนับคนละเกณฑ์ (คนละขอบเขต — ดู numbers-need-scope)
    ⇒ **เอาเลขของการ์ดไปเทียบกับแท็บของเราตรง ๆ ไม่ได้ ต้องเทียบใบต่อใบเท่านั้น**

    วิธีตรวจซ้ำ: GET /api/core?ordercheck=1&from=YYYY-MM-DD&to=YYYY-MM-DD (ไล่ทีละเดือน)
    ⚠️ **ใส่ข้อความกลับเมื่อไหร่ที่ตัวเลขน่าสงสัยอีก** จอจะเตือนเองทันที ไม่ต้องแก้จอ */
const STATUS_UNRELIABLE = null;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const thaiToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const daysAgo = (n) =>
  new Date(Date.now() + 7 * 3600e3 - n * 864e5).toISOString().slice(0, 10);

/** ตัวกรองที่ใช้ร่วมกันทั้งตัวนับและตัวดึงแถว */
function buildWhere({ from, to, channel, status, q, includeCancelled, source }) {
  const where = ["order_date >= ?", "order_date <= ?"];
  const params = [from, to];
  /* ⚠️ **ต้องกรองร้านได้** — กระจกเก็บสองร้าน (z1 ศีตกาล · z2 ceojet)
      และ **ชื่อช่องทางซ้ำกันข้ามร้าน** เช่น "TIKTOK" มีทั้งใน z1 (737 ใบ) และ z2 (58 ใบ)
      ถามด้วยชื่อช่องทางเฉย ๆ จึงได้ของสองร้านปนกันมาโดยไม่มีอะไรบอก
      (เจอจริง 4 ก.ย. 2569 ตอนไล่ว่าร้าน ceojet เลิกขายออนไลน์เมื่อไหร่ —
       ได้ใบล่าสุดเป็นวันนี้ ทั้งที่ใบนั้นเป็นของอีกร้าน) */
  if (source) {
    where.push("source = ?");
    params.push(source);
  }
  if (channel) {
    where.push("channel = ?");
    params.push(channel);
  }
  // กรองตามสถานะ — จอฝั่งเราทำแท็บสถานะแบบ ZORT (ทั้งหมด/รอโอน/สำเร็จ/ยกเลิก)
  // ⚠️ เทียบแบบตรงตัวเท่านั้น ไม่ใช้ LIKE — ค่าที่มาจากตัวเลือกบนจอ ไม่ใช่คำค้นอิสระ
  //    ใช้ LIKE เมื่อไหร่ "Success" จะไปลากคำอื่นที่มีคำนี้ประกอบมาด้วยแบบเงียบ ๆ
  if (status) {
    where.push("status = ?");
    params.push(status);
  }
  if (q) {
    where.push("(number LIKE ? OR customer LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (!includeCancelled) where.push(CANCEL_SQL);
  return { sql: where.join(" AND "), params };
}

/**
 * รายการขายจากคลังเงา
 * @param {object} o from · to (YYYY-MM-DD) · channel · status · q (เลขที่/ชื่อลูกค้า) ·
 *                   source (z1|z2) · limit · offset · includeCancelled
 */
export async function listOrders(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };

  // วันที่ต้องเป็นรูป YYYY-MM-DD เท่านั้น — ค่าเพี้ยนให้ถอยไปช่วงปลอดภัย ไม่ใช่ปล่อยผ่าน
  const to = DAY.test(String(o.to)) ? o.to : thaiToday();
  const from = DAY.test(String(o.from)) ? o.from : daysAgo(30);
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const channel = String(o.channel ?? "").slice(0, 60) || null;
  const status = String(o.status ?? "").slice(0, 60) || null;
  const q = String(o.q ?? "").trim().slice(0, 60) || null;
  const includeCancelled = !!o.includeCancelled;
  // รับเฉพาะค่าที่รู้จัก — ค่าแปลกปลอมให้เป็น null (ไม่กรอง) ดีกว่าเอาไปยัดลง SQL
  const source = ["z1", "z2"].includes(String(o.source)) ? String(o.source) : null;

  const w = buildWhere({ from, to, channel, status, q, includeCancelled, source });

  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s
     FROM orders WHERE ${w.sql}`,
    w.params
  );
  const rows = await coreQuery(
    /* ⚠️ เพิ่มคอลัมน์ในตารางแล้วต้องเพิ่มใน SELECT นี้ด้วย ไม่งั้นจอไม่มีวันเห็น
        (ฝั่งจอทักมา 4 ก.ย. 2569 — เก็บ integration_status เข้าฐานแล้วแต่แถวไม่มีฟิลด์นี้) */
    `SELECT id, source, number, channel, status, amount, customer, order_date, tracking_no, ship_channel, ship_name, ship_date, is_cod, pay_status, integration_status AS integrationStatus
     FROM orders WHERE ${w.sql}
     ORDER BY order_date DESC, number DESC
     LIMIT ${limit} OFFSET ${offset}`,
    w.params
  );

  /* ⚠️ **เหตุผลที่ช่องนี้ว่าง ต้องติดมากับแถว ไม่ใช่ให้จอไปจับคู่ชื่อช่องทางเอง**
      (ฝั่งจอชี้ 4 ก.ย. 2569 — ถ้าให้จอจับคู่เอง = กลับไปตัดสินประเภทจากชื่อ ซึ่งเราแบนแล้ว)
      เกณฑ์: ช่องทางนั้นมีค่าอยู่ **อย่างน้อย 5 ใบ และอย่างน้อย 1%** ⇒ ควรมีค่า แต่ใบนี้ไม่มี
      ⇒ source_empty (ต้นทางไม่ส่งมา) · ไม่ถึงเกณฑ์ ⇒ none_expected (ช่องทางนี้ไม่มีใครบอกสถานะ)
      ⚠️ ใช้เกณฑ์มีขั้นต่ำ ไม่ใช่ "เคยมีสักใบ" — ค่าหลุดใบเดียวจะพลิกทั้งกองทันที */
  const chanStats = await coreQuery(
    `SELECT COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch,
            COUNT(*) AS total,
            SUM(CASE WHEN COALESCE(integration_status,'') <> '' THEN 1 ELSE 0 END) AS withVal
     FROM orders GROUP BY 1`
  );
  /* ⚠️ **ต้องรวมชื่อช่องทางที่สะกดต่างกันก่อนคิดเกณฑ์** (ฝั่งจอชี้ 4 ก.ย. 2569)
      ในฐานมี "Line OA @gucut1" (177 ใบ) กับ "LINE OA @gucut1" (66 ใบ) ซึ่งเป็นช่องทางเดียวกัน
      ถูกนับแยกกัน ⇒ ถ้าวันหนึ่งก้อนหนึ่งข้ามเกณฑ์แต่อีกก้อนไม่ข้าม
      **ใบที่มาจากช่องทางเดียวกันจะได้ blankReason คนละอย่าง** โดยไม่มีอะไรฟ้อง
      ⚠️ รวมเฉพาะตอนคิดเกณฑ์เท่านั้น **ห้ามไปแก้ค่าที่เก็บในฐาน**
         ชื่อในฐานต้องตรงกับที่ ZORT ส่งมาจริง ไม่งั้นเทียบกลับกับต้นทางไม่ได้ (ordercheck จะพัง)
      ⚠️ รวมด้วย "ตัวพิมพ์ + ช่องว่าง" เท่านั้น ห้ามรวมด้วยการดูว่าชื่อมีคำไหนอยู่
         (no-substring-classification — "Shopee-gucut" กับ "ZAMA Shopee" คนละร้าน) */
  const chanKey = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const merged = new Map(); // คีย์ที่รวมแล้ว → { total, withVal }
  for (const r of chanStats) {
    const k = chanKey(r.ch);
    const acc = merged.get(k) || { total: 0, withVal: 0 };
    acc.total += num(r.total);
    acc.withVal += num(r.withVal);
    merged.set(k, acc);
  }
  const reasonOf = (ch) => {
    const acc = merged.get(chanKey(ch));
    if (!acc) return "none_expected";
    return acc.withVal >= 5 && acc.withVal * 100 >= acc.total ? "source_empty" : "none_expected";
  };
  const chanMap = { get: (ch) => reasonOf(ch) };

  /* ── อายุของข้อมูล ── (ฝั่งจอขอ 4 ก.ย. 2569)
      ทุกการ์ด/แท็บบนจอนี้นับจากกระจกล้วน ๆ ไม่ได้ยิง ZORT สด
      ถ้าซิงก์ตายเงียบไปหนึ่งวัน จอจะยังโชว์เลขเดิมสวยงามโดยไม่มีอะไรฟ้อง

      ⚠️ **ต้องส่งสองเวลา ห้ามส่งอันเดียว** — มันตอบคนละคำถาม
         syncedAt   = ครั้งสุดท้ายที่ "เราไปดู ZORT" (ชีพจร · มีทุกรอบแม้เขียน 0 แถว)
         changedAt  = ครั้งสุดท้ายที่ "ข้อมูลเปลี่ยนจริง" (MAX updated_at)
      ส่งแต่ changedAt อย่างเดียวจะหลอกตา: คืนที่ไม่มีออเดอร์ขยับเลย มันจะเก่าเป็นชั่วโมง
      ทั้งที่ซิงก์ทำงานปกติ ⇒ จอจะเตือนผิด แล้วคนจะเลิกเชื่อคำเตือน (warning-placement)
      ⚠️ ทุกเวลาเป็น **UTC** ตามที่ SQLite เก็บ — ชื่อฟิลด์ลงท้าย Utc เพื่อไม่ให้เดาผิด
         (กติกาเวลาใน CLAUDE.md: เก็บ UTC · คิดเป็นวันไทย · โชว์ต้องบวก 7 แล้วเขียนกำกับ) */
  let freshness = { syncedAtUtc: null, changedAtUtc: null, rangeChangedAtUtc: null };
  try {
    const [beat] = await coreQuery(`SELECT at FROM core_meta WHERE k = 'sync_orders'`);
    const [chg] = await coreQuery(`SELECT MAX(updated_at) AS at FROM orders`);
    const [rng] = await coreQuery(
      `SELECT MAX(updated_at) AS at FROM orders WHERE ${w.sql}`,
      w.params
    );
    freshness = {
      syncedAtUtc: beat?.at ?? null,
      changedAtUtc: chg?.at ?? null,
      rangeChangedAtUtc: rng?.at ?? null,
    };
  } catch {
    // ตารางชีพจรยังไม่ถูกสร้าง (ต้องยิง ?init=1) — คืน null ดีกว่าทำทั้งจอล้ม
  }

  // นับสถานะจัดส่งจากฐานทั้งช่วง (ไม่ใช่จากหน้าที่ตัดมาแล้ว)
  const statusCountsRaw = await coreQuery(
    `SELECT COALESCE(integration_status,'') AS st,
            COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch,
            COUNT(*) AS c
     FROM orders WHERE ${w.sql} GROUP BY 1,2`,
    w.params
  );

  // ยอดแยกช่องทางของ "ช่วงที่กรองอยู่" — ZORT ไม่มีให้ดูในจอเดียว แต่ร้านถามบ่อย
  const byChannel = await coreQuery(
    `SELECT channel, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
     FROM orders WHERE ${w.sql}
     GROUP BY channel ORDER BY amount DESC`,
    w.params
  );

  /* ── ยอดแยก "ร้าน" ของช่วงที่กรองอยู่ ── (ฝั่งจอขอ 5 ก.ย. 2569)
      เดิมท่อส่งแต่ `source` ติดมากับแต่ละแถว แต่ไม่บอก **ขอบเขต** ว่าตัวเลขรวมนับกี่ร้าน
      ⇒ จอต้องเขียนเองว่า "รวมทั้ง 2 ร้าน" ซึ่งถูกวันนี้ แต่เป็นข้อความแช่แข็ง
         วันที่มีร้านที่สาม มันจะโกหกเงียบ ๆ โดยไม่มีอะไรฟ้อง (computed-now-goes-stale)
      ⚠️ **ส่งรายการร้านที่มีอยู่จริงในช่วงนั้น ไม่ใช่ส่งประโยคสำเร็จรูป**
         จอนับ stores.length เอง ⇒ ร้านที่สามโผล่มาเมื่อไหร่ ป้ายเปลี่ยนตามเองทันที
      ⚠️ นับจากช่วงที่กรองอยู่ ไม่ใช่ทั้งฐาน — ช่วงที่ ceojet ไม่มีบิลเลย ต้องได้ 1 ร้าน ไม่ใช่ 2
      ⚠️ ผลรวม stores[].orders ต้องเท่ากับ total เป๊ะ (กติกา "บวกทุกกองเทียบยอดรวม") */
  const storeRows = await coreQuery(
    `SELECT source, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
     FROM orders WHERE ${w.sql}
     GROUP BY source ORDER BY source`,
    w.params
  );

  // ยอดแยก "สถานะ" ของช่วงที่กรองอยู่ — จอเอาไปทำแท็บพร้อมจำนวนในวงเล็บแบบ ZORT
  // ⚠️ ไม่กรองตามสถานะที่เลือกอยู่ ไม่งั้นแท็บอื่นจะกลายเป็นศูนย์หมดทันทีที่กดแท็บแรก
  //    (แท็บต้องบอกได้เสมอว่าแท็บอื่นมีกี่ใบ ไม่งั้นมันไม่ใช่แท็บ เป็นแค่ปุ่มกรอง)
  // ⚠️ **นับใบยกเลิกด้วยเสมอ** ไม่ว่าตัวกรองหลักจะรวมหรือไม่ —
  //    ไม่งั้นแท็บ "ยกเลิก" จะหายไปจากจอทั้งที่มีอยู่จริง (เจอจริง 2 ก.ย. 2569:
  //    มี Voided 44 ใบ แต่จอไม่มีแท็บให้กดเลย เพราะ byStatus ถูกกรองทิ้งไปก่อน)
  //    แท็บคือ "สารบัญ" ของข้อมูลทั้งหมด ไม่ใช่ผลของตัวกรองที่เลือกอยู่
  const wAll = buildWhere({ from, to, channel, q, includeCancelled: true });
  const byStatus = await coreQuery(
    `SELECT status, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
     FROM orders WHERE ${wAll.sql}
     GROUP BY status ORDER BY orders DESC`,
    wAll.params
  );

  return {
    from,
    to,
    limit,
    offset,
    status,
    total: num(sum?.c),
    totalAmount: num(sum?.s),
    byChannel,
    byStatus,
    /* ── ขอบเขต "ร้าน" ── จอใช้เขียนป้ายเองได้โดยไม่ต้องฮาร์ดโค้ดจำนวนร้าน
        store  = ร้านที่ถูกกรองอยู่ (null = ไม่ได้กรอง คือรวมทุกร้านที่มีในช่วงนี้)
        stores = ร้านที่มีบิลจริงในช่วงนี้ พร้อมยอดของแต่ละร้าน */
    store: source,
    stores: storeRows.map((r) => ({
      source: r.source,
      name: storeName(r.source),
      note: STORES[String(r.source)]?.note ?? null,
      orders: num(r.orders),
      amount: num(r.amount),
    })),
    storeScope: source
      ? `เฉพาะร้าน ${storeName(source)}`
      : "ทุกร้านที่มีบิลในช่วงนี้ — จอนับจาก stores.length เอง ห้ามเขียนจำนวนร้านตายตัว",
    // ⚠️ มีค่า = จอต้องขึ้นแถบแดงบนหัวจอ · เป็น null = ไม่ต้องขึ้น (ห้ามฮาร์ดโค้ดฝั่งจอ)
    statusUnreliable: STATUS_UNRELIABLE,
    // ⚠️ ส่งค่าดิบมาคู่กันเสมอ (integrationStatus) + เหตุผลตอนว่าง (blankReason)
    //    จอจะได้โชว์ของจริงตอนไล่ปัญหาได้ ไม่ต้องเดาอะไรเลย
    /* ⚠️ ส่ง **ค่าที่แปลแล้ว + ค่าดิบ** คู่กันเสมอ (ฝั่งจอขอ 4 ก.ย. 2569)
        จอโชว์ shipStatus ให้คนอ่าน · เก็บ integrationStatus ไว้ตอนไล่ปัญหา
        ค่าที่ตัวแปลไม่รู้จักจะได้ group "unknown" ⇒ **จอต้องโชว์ถังนี้ ห้ามซ่อน** */
    rows: rows.map((r) => {
      const s = readStatus(r.integrationStatus);
      return {
        ...r,
        shipStatus: s.th,
        shipStatusGroup: s.group,
        shipStatusKnown: s.known,
        ...(s.platform ? { shipStatusFrom: s.platform } : {}),
        ...(s.unverified ? { shipStatusUnverified: true } : {}),
        ...(String(r.integrationStatus ?? "") === ""
          ? { blankReason: chanMap.get(String(r.channel || "(ไม่ระบุ)")) || "none_expected" }
          : {}),
      };
    }),
    /* ⚠️ **ต้องนับที่ฐานข้อมูล ไม่ใช่จากแถวที่ตัดหน้ามาแล้ว** — ฝั่งจอจับได้ 4 ก.ย. 2569
        เดิมเขียน groupStatuses(rows) ซึ่ง rows ผ่าน LIMIT/OFFSET มาแล้ว = หน้าละ 50 ใบ
        แต่คอมเมนต์เขียนว่า "ของช่วงที่กรองอยู่" ⇒ **ป้ายผิดขอบเขต**
        การ์ดจะเขียนว่า "ช่วง 3 เดือน" ทั้งที่เป็นเลขของ 50 ใบแรก และพอกดหน้า 2
        ตัวเลขจะเปลี่ยนทั้งใบ ดูเหมือนบั๊กทั้งที่ของจริงคือขอบเขตไม่ตรงกับป้าย
        (กับดักเดิมของวันนี้ ครั้งที่ 4 — ดู numbers-need-scope)
      ⚠️ **เกณฑ์ตรวจ: ผลรวม count ทุกกอง ต้องเท่ากับ total ของช่วงนั้นเป๊ะ** */
    /* ⚠️ ชื่อฟิลด์บอกไว้แล้วว่าเป็น UTC — จอบวก 7 เอง
        และ **ต้องโชว์ syncedAt เป็นหลัก** ไม่ใช่ changedAt (เหตุผลอยู่ที่คำอธิบายด้านบน) */
    freshness,
    freshnessNote:
      "syncedAtUtc = ครั้งสุดท้ายที่ไปดู ZORT (มีทุกรอบแม้ไม่มีอะไรเปลี่ยน) · " +
      "changedAtUtc = ครั้งสุดท้ายที่ข้อมูลเปลี่ยนจริง · " +
      "rangeChangedAtUtc = เฉพาะช่วงที่กรองอยู่ · ทุกค่าเป็น UTC ต้องบวก 7 ก่อนโชว์",
    shipStatusGroups: groupsFromCounts(
      statusCountsRaw.map((r) => ({
        ...r,
        blankReason:
          String(r.st ?? "") === "" ? chanMap.get(String(r.ch)) || "none_expected" : null,
      }))
    ),
    shipStatusScope: "ทั้งช่วงที่กรองอยู่ (ไม่ใช่เฉพาะหน้าที่แสดง)",
  };
}

/** ใบเดียวพร้อมรายการสินค้า (ไว้กดดูรายละเอียดจากรายการขาย) */
export async function getOrder(id) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const key = String(id ?? "").slice(0, 80);
  if (!key) return { error: "ไม่ได้ระบุเลขใบ" };
  const [order] = await coreQuery(
    `SELECT id, source, number, channel, status, amount, customer, order_date, tracking_no, ship_channel, ship_name, ship_date, is_cod, pay_status, updated_at
     FROM orders WHERE id = ?`,
    [key]
  );
  if (!order) return { error: "ไม่พบใบนี้ในคลังเงา" };
  const items = await coreQuery(
    `SELECT line, sku, name, qty, amount FROM order_items
     WHERE order_id = ? ORDER BY line`,
    [key]
  );
  return { order, items };
}

/** รายชื่อช่องทางทั้งหมดที่เคยเห็น — ไว้ทำตัวเลือกในกล่องกรอง */
export async function listChannels(source = null) {
  if (!coreReady()) return [];
  /* ⚠️ **รายชื่อช่องทางต้องเคารพตัวกรองร้านด้วย** (ฝั่งจอชี้ 4 ก.ย. 2569)
      ถ้าไม่กรอง เลือกร้าน ceojet แล้วกล่องช่องทางยังขึ้น Lazada-gucut · Shopee-gucut ·
      Shopify ครบ ทั้งที่ร้านนั้นเลิกขายออนไลน์ไปตั้งแต่ 22 ก.พ. 2569
      ⇒ คนกดเลือกได้แล้วได้ 0 ใบ โดยไม่มีอะไรบอกว่า "ร้านนี้ไม่มีช่องทางนี้"
      ซึ่งหน้าตาเหมือนระบบพังทุกประการ
      ⚠️ ตัวกรองที่ครอบคลุมไม่เท่ากันระหว่าง "ตัวเลือก" กับ "ผลลัพธ์" คือกับดักประจำ —
         ตัวเลือกต้องมาจากขอบเขตเดียวกับที่ผลลัพธ์จะถูกกรอง */
  const src = ["z1", "z2"].includes(String(source)) ? String(source) : null;
  const rows = await coreQuery(
    `SELECT channel, COUNT(*) AS orders FROM orders
     WHERE channel IS NOT NULL AND channel <> ''${src ? " AND source = ?" : ""}
     GROUP BY channel ORDER BY orders DESC LIMIT 40`,
    src ? [src] : []
  );
  return rows.map((r) => r.channel);
}

/** จอ "บริการส่งสินค้า" แบบ ZORT — เลขพัสดุ · วันที่ · ผู้รับ · ขนส่ง · สถานะ · เลขออเดอร์
 *
 *  ⚠️ **ZORT ไม่มี endpoint ขนส่งแยก** (Logistic · Shipping · Delivery ตอบ 404 ทั้งหมด)
 *     แต่ใบขายมี 114 ฟิลด์ รวมข้อมูลขนส่งครบ ⇒ อ่านจากกระจกออเดอร์ที่มีอยู่แล้ว
 *     ไม่ต้องยิง ZORT เพิ่มแม้แต่ครั้งเดียว
 *  ⚠️ **ใบที่ยังไม่มีเลขพัสดุ ไม่ใช่ "ข้อมูลหาย"** — คือยังไม่ได้ส่งของ
 *     จอต้องแยกสองอย่างนี้ ห้ามรวมเป็นช่องว่างเหมือนกัน
 */
export async function listLogistics(o = {}) {
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const limit = Math.max(1, Math.min(200, num(o.limit) || 50));
  const offset = Math.max(0, num(o.offset));
  const q = String(o.q ?? "").trim().slice(0, 60);
  const parts = [];
  const params = [];
  if (q) {
    parts.push(`(tracking_no LIKE ? OR number LIKE ? OR ship_name LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  /* ⚠️ **ขอบเขตของจอนี้คือ "ใบที่มีการส่งของ" ไม่ใช่ออเดอร์ทั้งหมด**
      รอบแรกผมกวาดทุกแถวในตาราง orders มาแสดง = 12,127 ใบ ทั้งที่ ZORT มี 1,644
      เพราะในนั้นมีใบรับของ (RC-*) และออเดอร์เก่าที่ไม่เคยมีการส่งปนมาด้วย
      ⇒ นับเฉพาะใบที่มีร่องรอยการส่งจริง (มีเลขพัสดุ หรือระบุขนส่งไว้) */
  const SCOPE = `(COALESCE(tracking_no,'') <> '' OR COALESCE(ship_channel,'') <> '')`;
  parts.push(SCOPE);
  /* แท็บ: ส่งแล้ว / ยังไม่ได้ส่ง — ตัดสินจาก "มีเลขพัสดุหรือยัง" · เก็บเงินปลายทางดูที่ is_cod
     ⚠️ **แท็บ `cod` เคยหายไปจากรายการนี้ ทั้งที่จอมีแท็บนั้นและมีป้ายตัวเลขกำกับ**
        (เจอ 4 ก.ย. 2569) ⇒ `only=cod` ตกลงมาเป็น undefined = ไม่กรองอะไรเลย
        แต่ยังสะท้อน `only:"cod"` กลับไป **จอเลยขึ้นแถวชุดเดียวกับแท็บ "ทั้งหมด"**
        รวมใบที่ไม่ใช่ COD ด้วย โดยที่ทุกอย่างดูเหมือนทำงานปกติทุกประการ
     ⚠️ **ค่าที่สะท้อนกลับต้องเป็น "ค่าที่ใช้จริง" เสมอ ห้ามสะท้อนค่าที่ส่งมาดิบ ๆ**
        (โรคเดียวกับ stockcard — จอที่ใช้ `applied` เป็นด่านจะผ่านทั้งที่ข้อมูลไม่ตรงตัวกรอง) */
  const ONLY = {
    shipped: `COALESCE(tracking_no,'') <> ''`,
    unshipped: `COALESCE(tracking_no,'') = ''`,
    cod: `COALESCE(is_cod,0) = 1`,
  };
  const asked = o.only == null || o.only === "" ? null : String(o.only);
  const known = asked === null || Object.prototype.hasOwnProperty.call(ONLY, asked);
  const usedOnly = known ? asked : null;
  const only = usedOnly ? ONLY[usedOnly] : null;
  const where = [...parts, ...(only ? [only] : [])].join(" AND ") || "1=1";
  const whereNoTab = parts.join(" AND ") || "1=1";

  // ⚠️ ตัวเลขบนแท็บต้องนับข้ามตัวกรองแท็บเสมอ (กติกาเดียวกับทุกจอ)
  const [sum] = await coreQuery(
    `SELECT COUNT(*) AS c,
            SUM(CASE WHEN COALESCE(tracking_no,'') <> '' THEN 1 ELSE 0 END) AS shipped,
            SUM(CASE WHEN COALESCE(tracking_no,'') = '' THEN 1 ELSE 0 END) AS unshipped,
            SUM(CASE WHEN COALESCE(is_cod,0) = 1 THEN 1 ELSE 0 END) AS cod
     FROM orders WHERE ${whereNoTab}`,
    params
  );
  /* ⚠️ **ห้าม LIMIT ตรงนี้ถ้าจะเอาไปจัดกลุ่มต่อ** — ตัด 20 ชื่อแรกแล้วค่อยรวม
      = ชื่อสะกดแปลก ๆ ที่มีไม่กี่ใบหลุดออกไปเงียบ ๆ แล้วยอดรวมของเจ้านั้นขาดหายโดยไม่มีใครรู้
      ชื่อขนส่งมีไม่กี่สิบแบบ ดึงมาทั้งหมดไม่หนัก */
  const byChannel = await coreQuery(
    `SELECT COALESCE(NULLIF(ship_channel,''),'(ยังไม่ระบุขนส่ง)') AS channel, COUNT(*) AS c
     FROM orders WHERE ${whereNoTab}
     GROUP BY COALESCE(NULLIF(ship_channel,''),'(ยังไม่ระบุขนส่ง)') ORDER BY c DESC`,
    params
  );
  const { groupCarriers } = await import("./carriers.mjs");
  const carrierGroups = groupCarriers(byChannel);
  const rows = await coreQuery(
    `SELECT o.id AS id, o.number AS number, o.tracking_no AS trackingNo,
            COALESCE(NULLIF(o.ship_date,''), o.order_date) AS date,
            o.ship_name AS receiver, o.ship_channel AS carrier, o.status AS status,
            COALESCE(o.is_cod,0) AS isCod,
            (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS lines
     FROM orders o WHERE ${where}
     ORDER BY COALESCE(NULLIF(o.ship_date,''), o.order_date) DESC, o.number DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  /* ⚠️ **`total` กับ `shown` คนละตัว ห้ามเอา `total` ไปทำเลขหน้า** (กติกาเดียวกับจอสต็อก)
      `total` = ทั้งขอบเขต ใช้ทำป้ายตัวเลขบนแท็บ (ต้องนับข้ามตัวกรองแท็บเสมอ)
      `shown` = จำนวนแถวของแท็บที่เลือกอยู่ ⇒ **ตัวนี้เท่านั้นที่เอาไปทำเลขหน้า/ปุ่มถัดไป**
      เดิมจอใช้ `total` ทำเลขหน้า ⇒ แท็บ "ยังไม่ได้ส่ง" มี 10 ใบ แต่เขียนว่า "แสดง 10 จาก 558"
      และปุ่มถัดไปยังกดได้ กดแล้วได้หน้าว่าง (เจอ 4 ก.ย. 2569) */
  const [shownRow] = await coreQuery(`SELECT COUNT(*) AS c FROM orders WHERE ${where}`, params);
  return {
    total: num(sum?.c),
    shown: num(shownRow?.c),
    shipped: num(sum?.shipped),
    unshipped: num(sum?.unshipped),
    cod: num(sum?.cod),
    limit,
    offset,
    only: usedOnly,
    applied: { only: usedOnly, limit, offset, q: q || null },
    ...(known ? {} : { ignored: { only: asked }, note: `ไม่รู้จักตัวกรอง "${asked}" — แสดงทั้งหมดแทน` }),
    byChannel, // ชื่อดิบ — ห้ามถอด กลุ่มเป็นของสำหรับอ่าน ไม่ใช่ของแทนความจริง
    carrierGroups: carrierGroups.groups,
    // ⚠️ ตาข่าย: ขนส่งเจ้าใหม่ที่ยังไม่รู้จักจะโผล่ตรงนี้ ไม่ถูกยัดเข้ากลุ่มอื่นมั่ว ๆ
    carrierUngrouped: carrierGroups.ungrouped,
    carrierUngroupedNames: carrierGroups.ungroupedNames,
    // ⚠️ **จอต้องบอกขอบเขตให้ชัด** ตัวเลขนี้ยังน้อยกว่าที่ ZORT แสดง (1,644 ใบ)
    //    เพราะเราเพิ่งเริ่มเก็บเลขพัสดุ ใบเก่าที่หัวใบไม่เปลี่ยนแล้วจึงยังไม่มีค่า
    //    ⇒ เขียนว่า "เท่าที่เก็บได้" ห้ามเขียนว่าเป็นทั้งหมด
    coversFrom: "เริ่มเก็บข้อมูลขนส่ง 3 ก.ย. 2569",
    zortShows: 1644,
    note:
      "อ่านจากกระจกออเดอร์ — ZORT ไม่มี API ขนส่งแยก · " +
      "นับเฉพาะใบที่มีร่องรอยการส่ง (มีเลขพัสดุหรือระบุขนส่ง) ไม่ใช่ออเดอร์ทั้งหมด · " +
      "ยังน้อยกว่าที่ ZORT แสดงเพราะใบเก่าที่ไม่ขยับแล้วยังไม่ถูกเก็บเลขพัสดุ",
    rows: rows.map((r) => ({ ...r, isCod: num(r.isCod) === 1 })),
  };
}
