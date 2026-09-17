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
import { contains } from "./sql-contains.mjs";
import { readStatus, groupsFromCounts, groupKeyOf } from "./order-status.mjs";
import { isRealDay } from "./param-guard.mjs";

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
/** แปลงค่า store จากคำขอเป็นตัวกรองร้าน — **ตัวเดียวที่ทุกเส้นออเดอร์ใช้**
 *  ว่าง / "all" ⇒ `{ source: null }` (ทุกร้าน) · "z1" | "z2" ⇒ ร้านนั้น · ค่าอื่น ⇒ `{ error }`
 *  🔴 (15 ก.ย. 2569) เดิมสามฟังก์ชันแปลงกันเองคนละแบบ: listOrders/listChannels ปัดค่าแปลกเป็น "ทุกร้าน"
 *     แต่ listOrderFacets เอาค่าดิบไปกรอง ⇒ `store=all` ได้ 1,299 ใบที่ list=orders
 *     แต่ได้ **0** พร้อมป้าย "เฉพาะร้าน all" ที่ orderfacets · และ `source=`/`store=zzz` ไม่กรองโดยไม่มีอะไรเตือน
 *  ⇒ เส้นใน core.mjs ตอบ 400 เมื่อได้ `error` · ตัวในไลบรารีปัดเป็นทุกร้าน (ห้ามเอาค่าดิบลง SQL) */
export function parseStore(raw) {
  const v = String(raw ?? "").trim();
  if (v === "" || v === "all") return { source: null };
  if (v === "z1" || v === "z2") return { source: v };
  return { error: `store ต้องเป็น z1 · z2 · all (ได้มา "${v.slice(0, 20)}")` };
}

/** ตัวกรองร้านของ **เส้นที่ตอบทีละร้าน** (pending · cardguess · ordercheck)
 *  ว่าง ⇒ z1 (ค่าเดิม — หน้าแรกกับจอแพ็คยิง pending=1 โดยไม่ใส่ร้าน) · "z1" | "z2" ⇒ ร้านนั้น
 *  "all" / ค่าอื่น ⇒ `{ error }` — 🔴 (15 ก.ย. 2569) เดิมอะไรที่ไม่ใช่ "z2" ตกเป็น z1 เงียบ ๆ
 *     ฝั่งจอวัดไว้ก่อนแก้: pending=1&store=all ได้ store:"z1" ⇒ คนขอทุกร้านได้ร้านเดียวโดยไม่รู้ตัว */
export function parseSingleStore(raw) {
  const v = String(raw ?? "").trim();
  if (v === "") return { source: "z1", defaulted: true };
  if (v === "z1" || v === "z2") return { source: v, defaulted: false };
  return { error: `store ต้องเป็น z1 หรือ z2 — เส้นนี้ตอบทีละร้าน ${v === "all" ? "(all ใช้ไม่ได้ ยิง z1 และ z2 แยกแล้วรวมเอง)" : `(ได้มา "${v.slice(0, 20)}")`}` };
}

/** ตัวกรองร้านของ **เส้นที่มีแค่ร้าน z1** (list=purchases · transfers · quotations · returnorders)
 *  🔴 (15 ก.ย. 2569) พิสูจน์จากโค้ด: core-purchases.mjs อ่านรหัส ZORT แค่ ZORT_STORENAME ชุดเดียว
 *     ตารางกระจกไม่มีคอลัมน์ source ⇒ ทุกแถวคือร้าน z1 · ร้าน z2 **ไม่เคยถูกดึง**
 *     เดิม store=z2/all ได้เลขเท่ากับ z1 เป๊ะ (ฝั่งจอวัด: 689/689/689 · 32 · 6 · 12,003) = ร้านเดียวหน้าตาเหมือนทุกร้าน
 *  ว่าง / "z1" ⇒ z1 · "z2" / "all" / ค่าอื่น ⇒ `{ error }` — ห้ามตอบของ z1 ในชื่อร้านอื่น
 *  ⏳ ถอดตัวนี้ได้เมื่อตัวซิงก์ดึงร้าน z2 จริง (คอลัมน์ source + กุญแจกันเลขซ้ำข้ามร้าน + กวาดย้อนหลัง) */
export function parseZ1OnlyStore(raw) {
  const v = String(raw ?? "").trim();
  if (v === "" || v === "z1") return { source: "z1" };
  if (v === "z2" || v === "all")
    return { error: `เส้นนี้มีแค่ร้าน z1 — ยังไม่ได้ดึงเอกสารของร้าน z2 เข้าระบบ (ขอ store=${v} ไม่ได้)` };
  return { error: `store ต้องเป็น z1 — เส้นนี้มีแค่ร้าน z1 (ได้มา "${v.slice(0, 20)}")` };
}
export const Z1_ONLY_SCOPE = { store: "z1", storeScope: "เฉพาะร้าน z1 — ยังไม่ได้ดึงเอกสารของร้าน z2 เข้าระบบ" };

function buildWhere({ from, to, channel, status, q, includeCancelled, source, payStatus, cod, product, shipChannel, shipFrom, shipTo, amountMin, amountMax, number, customer, tag, createUser, warehouse }) {
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
    /* tracking_no เพิ่ม 7 ก.ย. 2569 (ฝั่งจอขอ) — ผัง ZORT ให้แพ็คด้วยการยิง
       เลขพัสดุจากใบปะหน้าเข้าช่องค้นหา ⇒ ค้นไม่เจอ = จอแพ็คสินค้าใช้แทนไม่ได้จริง
       ✅ ยิงพิสูจน์ก่อนอ้าง (7 ก.ย. 2569 · ตัวอย่าง 200 ใบ 1 ส.ค.–6 ก.ย.):
          ช่องทางออนไลน์มีเลขครบ 100% ทุกใบ (Shopee 62/62 · Lazada 43/43 ·
          TikTok 12/12 · FB 9/9 · LINE 1/1) · ใบที่ไม่มีเลขเป็น POS ล้วน 73/73
          = ขายหน้าร้านรับของเลย **ไม่มีขนส่งจริง ไม่ใช่ข้อมูลขาด** */
    where.push(`(${contains("number")} OR ${contains("customer")} OR ${contains("tracking_no")})`);
    params.push(q, q, q);
  }
  /* 🔎 ตัวกรองค้นหาขั้นสูงแบบ ZORT (15 ก.ย. 2569 · ใบ t_mu2sy2fu · ต่อจากตารางของคุณส้ม ค้นหาขั้นสูง-จอขาย-เทียบ-ZORT.md)
     ข้อมูลมีในกระจกอยู่แล้วแต่ท่อไม่เคยรับ · ทุกตัวอยู่ในตัวสร้างเงื่อนไขตัวนี้ตัวเดียว ⇒ ยอดขาย · แถว · ยอดหักคืน · แท็บ ใช้ชุดเดียวกัน
     📏 รูปค่าจริง (วัด 15 ก.ย. 200 ใบ): ship_date = YYYY-MM-DD หรือ '' (ยังไม่ส่ง) · is_cod 1/0 · pay_status Paid/Voided/Pending
        · ship_channel สะกดหลายแบบ ("Flash Express" · "Flash express" · "Drop-off: Flash Express, …") ⇒ ใช้ contains ไม่ใช่ = */
  if (payStatus) { where.push("pay_status = ?"); params.push(payStatus); }
  if (cod === "1") where.push("is_cod = 1");
  if (cod === "0") where.push("COALESCE(is_cod,0) = 0");
  if (product) {
    // ⚠️ อ้าง orders.id ตรง ๆ — เงื่อนไขนี้ถูกฝังใน EXISTS ของยอดหักคืนด้วย (FROM orders WHERE …) ต้องชี้ตารางใบขายชั้นนั้น
    where.push(`EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id AND (${contains("oi.sku")} OR ${contains("oi.name")}))`);
    params.push(product, product);
  }
  if (shipChannel) { where.push(contains("ship_channel")); params.push(shipChannel); }
  if (shipFrom || shipTo) where.push("COALESCE(ship_date,'') <> ''"); // ใบที่ยังไม่ส่งไม่เข้าเงื่อนไขช่วงวันส่ง
  if (shipFrom) { where.push("ship_date >= ?"); params.push(shipFrom); }
  if (shipTo) { where.push("ship_date <= ?"); params.push(shipTo); }
  if (amountMin !== null && amountMin !== undefined) { where.push("amount >= ?"); params.push(amountMin); }
  if (amountMax !== null && amountMax !== undefined) { where.push("amount <= ?"); params.push(amountMax); }
  if (number) { where.push(contains("number")); params.push(number); }
  if (customer) { where.push(contains("customer")); params.push(customer); }
  // Tag · ผู้สร้าง · คลัง (15 ก.ย. 2569 · ใบ t_mu2tzeb1) — ใบที่ซิงก์ก่อนมีคอลัมน์เป็น NULL จนกว่าจะกวาดย้อนหลัง
  if (tag) { where.push(contains("tag")); params.push(tag); }
  if (createUser) { where.push(contains("create_user")); params.push(createUser); }
  if (warehouse) { where.push("warehouse_code = ?"); params.push(warehouse); }
  if (!includeCancelled) where.push(CANCEL_SQL);
  return { sql: where.join(" AND "), params };
}

/** ค่าตัวกรองค้นหาขั้นสูงจากผู้เรียก → ค่าที่ใช้จริง (ผ่าน param-guard มาแล้ว · ตรงนี้กันค่าเพี้ยนซ้ำอีกชั้น) */
function advancedFrom(o = {}) {
  const txt = (v, n) => String(v ?? "").trim().slice(0, n) || null;
  const numOrNull = (v) => (v === null || v === undefined || String(v).trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    payStatus: txt(o.payStatus, 40),
    cod: o.cod === "1" || o.cod === "0" ? o.cod : null,
    product: txt(o.product, 60),
    shipChannel: txt(o.shipChannel, 60),
    // วันจริงตามปฏิทิน ไม่ใช่แค่รูป — รุ่นแรกใช้ DAY แล้ว 2026-13-01 หลุดลง WHERE (เทสต์จับได้ก่อน push)
    shipFrom: isRealDay(o.shipFrom) ? o.shipFrom : null,
    shipTo: isRealDay(o.shipTo) ? o.shipTo : null,
    amountMin: numOrNull(o.amountMin),
    amountMax: numOrNull(o.amountMax),
    number: txt(o.number, 60),
    customer: txt(o.customer, 60),
    tag: txt(o.tag, 60),
    createUser: txt(o.createUser, 60),
    warehouse: txt(o.warehouse, 40),
  };
}

/**
 * รายการขายจากคลังเงา
 * @param {object} o from · to (YYYY-MM-DD) · channel · status · q (เลขที่/ชื่อลูกค้า) ·
 *                   source (z1|z2) · limit · offset · includeCancelled
 */
/** ── ป้ายชื่อร้าน + ยอดแยกช่องทาง แบบ "เบา" ──
 *  ฝั่งจอขอ 5 ก.ย. 2569 หลังวัดเจอว่า `list=orders&limit=1` กับ `limit=200`
 *  ใช้เวลา **เท่ากันเป๊ะ** (4.15 กับ 4.21 วิ) ⇒ ต้นทุนคือ "จำนวนรอบไป-กลับ D1" ล้วน ๆ
 *  จอคลังกับจอช่องทางขอ `limit=1` เพื่อเอาแค่ป้ายชื่อร้าน แต่จ่ายเต็ม 4 วิทุกครั้ง
 *  เพราะ listOrders ยิง 10 query เสมอไม่ว่าจะขอกี่แถว
 *
 *  ตัวนี้ยิงแค่ 2 query พร้อมกัน และ **ไม่ดึงแถวออเดอร์เลยสักแถว**
 *  ⚠️ **ห้ามเติม query ลงตัวนี้เพื่อความสะดวก** — จุดขายทั้งหมดของมันคือ "รอบน้อย"
 *     อยากได้อะไรเพิ่มให้ไปใช้ list=orders ตามเดิม ไม่งั้นอีกหน่อยมันจะช้าเท่ากันแล้วไม่มีใครรู้ว่าทำไม
 *  ⚠️ ช่องที่คืนต้อง **ชื่อและรูปแบบเดียวกับใน listOrders เป๊ะ** (stores · byChannel · storeScope)
 *     ไม่งั้นจอต้องเขียนโค้ดอ่านสองแบบ แล้ววันหนึ่งสองแบบจะเพี้ยนออกจากกันเงียบ ๆ
 */
export async function listOrderFacets(o = {}) {
  const from = o.from || null;
  const to = o.to || null;
  const source = parseStore(o.source).source ?? null;
  /* ⚠️ **ต้องรับตัวกรองครบชุดเท่ากับ list=orders** (ฝั่งจอทักมา 5 ก.ย. 2569)
      เดิมตัวนี้ทิ้ง `status` กับ `q` ไปเงียบ ๆ ⇒ จอที่กรองสถานะหรือค้นหาอยู่
      จะได้ยอดของ "ทั้งช่วง" แทนที่จะเป็นยอดของสิ่งที่กรองไว้ **โดยไม่มีอะไรฟ้อง**
      เป็นกับดักเดียวกับที่ไล่กันมาทั้งวัน: เร็วขึ้นจริง แต่ตัวเลขตอบคนละคำถาม
      ⇒ ส่งต่อทุกตัวให้ตัวสร้างเงื่อนไขตัวเดียวกัน จะได้ไม่มีวันเพี้ยนออกจากกัน */
  const w = buildWhere({
    from,
    to,
    channel: o.channel || null,
    status: o.status || null,
    q: o.q ? String(o.q).trim().slice(0, 60) : null,
    includeCancelled: o.includeCancelled === true,
    source,
    ...advancedFrom(o),
  });

  /* 🏬 byWarehouse — ยอดตามคลังของใบ (warehouses=1 เท่านั้น · ขอเพิ่ม 15 ก.ย. 2569 จากแท็บ ตามคลัง/สาขา เมนู 2)
      ⚠️ ขอเองเท่านั้น — ตัวนี้มีจุดขายที่ "รอบน้อย" (คอมเมนต์หัวฟังก์ชัน) ไม่ขอ = ไม่ยิงเพิ่มสักรอบ
      ⚠️ ใบที่ไม่รู้คลัง (warehouse_code NULL/'' — ใบก่อน 1 ก.ย. 2569 ที่ยังไม่กวาดย้อนหลัง) รวมเป็นแถว code "" ของตัวเอง
         ⇒ จอไม่ต้องคิด "ยอดรวม − ผลรวมคลัง" เอง (คิดเองพังเงียบเมื่อมีคลังใหม่หรือขอบเขตไม่ตรงกัน) */
  const wantWarehouses = o.warehouses === true || o.warehouses === "1";
  const [storeRows, byChannel, byWarehouse, retByWarehouse] = await Promise.all([
    coreQuery(
      `SELECT source, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
       FROM orders WHERE ${w.sql}
       GROUP BY source ORDER BY source`,
      w.params
    ),
    coreQuery(
      `SELECT channel, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
       FROM orders WHERE ${w.sql}
       GROUP BY channel ORDER BY amount DESC`,
      w.params
    ),
    wantWarehouses
      ? coreQuery(
          `SELECT COALESCE(warehouse_code,'') AS code, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
           FROM orders WHERE ${w.sql}
           GROUP BY COALESCE(warehouse_code,'') ORDER BY amount DESC`,
          w.params
        )
      : Promise.resolve(null),
    /* ใบรับคืนรายคลัง (ZORT แท็บ ตามคลัง/สาขา มีคอลัมน์ "จำนวนรายการรายรับคืน") — ขอพร้อม warehouses=1 เท่านั้น
       ⚠️ นิยามเดียวกับ returnedAmount ของ listOrders: ใบคืนของ "ใบขายที่อยู่ในตัวกรองนี้" จับคู่เลขที่ + ร้าน · ใบคืนยกเลิกไม่นับ
       ⚠️ จัดกองตาม **คลังของใบขาย** (ให้แถวตรงกับ byWarehouse) ไม่ใช่คลังที่รับคืน
       ⚠️ เลขที่ใบขายซ้ำในร้านเดียวกันได้ ⇒ คลังของใบคืนแบบนั้นหยิบใบแรกที่เจอ (หายากมาก ยอมรับได้)
       ⚠️ อ่านไม่ได้ ⇒ null ทั้งก้อน (จอขึ้น "ยังไม่รู้") ห้ามเป็น 0 */
    wantWarehouses
      ? coreQuery(
          `SELECT COALESCE((SELECT o.warehouse_code FROM orders o WHERE o.number = return_orders_v2.reference AND o.source = return_orders_v2.source LIMIT 1),'') AS code,
                  COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s
           FROM return_orders_v2
           WHERE EXISTS (SELECT 1 FROM orders WHERE orders.number = return_orders_v2.reference AND orders.source = return_orders_v2.source AND ${w.sql})
             AND COALESCE(status,'') NOT LIKE '%void%' AND COALESCE(status,'') NOT LIKE '%cancel%'
           GROUP BY 1`,
          w.params
        ).catch(() => null)
      : Promise.resolve(null),
  ]);
  const retMap = retByWarehouse ? new Map(retByWarehouse.map((r) => [String(r.code ?? ""), r])) : null;

  return {
    from, to,
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
    byChannel,
    ...(byWarehouse
      ? {
          byWarehouse: byWarehouse.map((r) => {
            const code = String(r.code ?? "");
            const ret = retMap ? retMap.get(code) : undefined;
            return {
              code, orders: num(r.orders), amount: num(r.amount),
              // null = อ่านใบคืนไม่ได้ (ไม่รู้) · 0 = อ่านได้และไม่มีใบคืน
              returns: retMap ? num(ret?.c) : null,
              returnsAmount: retMap ? num(ret?.s) : null,
            };
          }),
          returnsScope: "returns = ใบคืนของใบขายในตัวกรองนี้ (จับคู่เลขที่+ร้าน · ไม่นับใบคืนยกเลิก) จัดกองตามคลังของใบขาย · null = อ่านใบคืนไม่ได้",
          warehouseScope: "code \"\" = ใบที่ยังไม่รู้คลัง (เก็บคลังของใบตั้งแต่ 1 ก.ย. 2569 · ใบเก่ากำลังกวาดย้อนหลัง) · ผลรวมทุกแถว = ยอดของ stores ในคำขอเดียวกัน",
        }
      : {}),
    /* ⚠️ **บอกให้ชัดว่าตัวนี้ไม่มีอะไร** ไม่งั้นจอที่เผลอเรียกตัวนี้แทน list=orders
        จะเห็น rows หายไปแล้วนึกว่า "ช่วงนี้ไม่มีออเดอร์" ซึ่งเป็นคนละเรื่องกันคนละขั้ว */
    note: "ตัวนี้ตอบแค่ป้ายชื่อร้านกับยอดแยกช่องทาง — ไม่มี rows · total · byStatus โดยตั้งใจ (ต้องการของพวกนั้นให้ใช้ list=orders)",
  };
}

/** 🔑 **เหตุผลที่สถานะว่าง — กติกามีที่เดียว** (แยกออกมา 12 ก.ย. 2569)
 *  เดิมนิพจน์นี้ถูกเขียนซ้ำสองที่: ฝั่งแถว กับ ฝั่งนับกอง ⇒ ตัวทดสอบจับได้ว่าสองฝั่ง
 *  ให้คำตอบคนละอย่างได้ถ้าใครแก้ข้างเดียว (เจอจริงตอนทำเทสให้เดินผ่านโค้ดจริง)
 *  ⇒ ค่าปริยาย "none_expected" อยู่ที่นี่ที่เดียว ห้ามเขียน `|| "none_expected"` ที่อื่นอีก
 *  คืน null เมื่อใบนั้น **มี** สถานะจากแพลตฟอร์ม (ไม่ใช่เคสว่าง) */
export function blankReasonFor(integrationStatus, channel, chanMap = new Map()) {
  if (String(integrationStatus ?? "") !== "") return null;
  return chanMap.get(String(channel || "(ไม่ระบุ)")) || "none_expected";
}

/** เติมช่องสถานะให้แถวหนึ่งแถว — **แยกออกมาเพื่อให้ทดสอบได้โดยไม่ต้องมีฐานข้อมูล**
 *
 *  🔴 ทำไมต้องแยก (12 ก.ย. 2569): ตัวทดสอบรุ่นแรกของผม **เลียนแบบ** ตรรกะตรงนี้เอง
 *     ⇒ ตอนลองทำให้พัง (ให้แถวกลับไปใช้ชื่อเก่า / ถอด blankReason) **เทสยังเขียว**
 *     เพราะมันไม่ได้เดินผ่านโค้ดจริงสักบรรทัด = ด่านที่ไม่มีคม (กฎ test-must-hit-the-path)
 *     ⇒ ยกออกมาเป็นฟังก์ชัน แล้วให้ทั้งของจริงและเทสเรียกตัวนี้ตัวเดียวกัน
 *  @param chanMap Map<ช่องทาง, เหตุผลที่สถานะว่าง> — ท่อคิดมาให้แล้ว จอห้ามเดาเอง
 */
export function decorateOrderRow(r, chanMap = new Map()) {
  const s = readStatus(r.integrationStatus);
  /* 🔴 **ชื่อกองของแถว ต้องเป็นชื่อเดียวกับที่ประกาศในรายการสรุป** (แก้ 12 ก.ย. 2569)
      ของเดิมแถวส่ง `blank` เฉย ๆ แต่รายการสรุปประกาศ `blank_none_expected`
      ⇒ จอที่กรองแถวด้วยชื่อจากรายการสรุป **ไม่เจอแถวกลุ่มนี้เลย และเงียบ**
      ⇒ ใช้ `groupKeyOf` ตัวเดียวกับที่รายการสรุปใช้ **ห้ามเขียนเงื่อนไขซ้ำที่นี่**
      (สองจอที่อ่าน `blank` อยู่ก่อนหน้านี้รอดทั้งคู่ เพราะเขียนเผื่อไว้ — CEO ตรวจแล้ว
       แต่ **ของที่รอดโดยบังเอิญ ไม่เท่ากับของที่ไม่ต้องแก้**)
      ⚠️ `blankReason` ยังต้องอยู่คู่กันเสมอ — ค่าดิบต้องไม่หายไปเพราะประกอบชื่อให้แล้ว */
  const blankReason = blankReasonFor(r.integrationStatus, r.channel, chanMap);
  return {
    ...r,
    shipStatus: s.th,
    shipStatusGroup: groupKeyOf(s.group, blankReason),
    shipStatusKnown: s.known,
    ...(s.platform ? { shipStatusFrom: s.platform } : {}),
    ...(s.unverified ? { shipStatusUnverified: true } : {}),
    ...(blankReason ? { blankReason } : {}),
  };
}

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
  const source = parseStore(o.source).source ?? null;
  const adv = advancedFrom(o);

  const w = buildWhere({ from, to, channel, status, q, includeCancelled, source, ...adv });

  /* ⚠️ **ยิง D1 พร้อมกัน ห้ามเรียงกัน** (แก้ 5 ก.ย. 2569)
      ของเดิมยิง D1 **10 รอบเรียงกัน** ในคำขอเดียว ⇒ วัดจริงได้ 4.5 วินาที
      D1 อยู่ไกล หนึ่งรอบไป-กลับราว 0.3–0.5 วิ ⇒ เวลาเกือบทั้งหมดคือ "รอเดินทาง" ไม่ใช่ "คิดเลข"
      เจ้าของร้านบอกว่า admin.gucut.com ช้าทุกเมนู · คลาสเดียวกับ /api/live ที่ช้า 25 วิ
      ⚠️ **ห้ามเอา await กลับมาเรียงกันอีก** ต่อให้อ่านง่ายกว่า
      ⚠️ เพิ่ม query ใหม่ต้องถามก่อนเสมอว่า "ตัวนี้ต้องรอผลของตัวก่อนหน้าจริงไหม"
         ไม่ต้องรอ ⇒ **ใส่ใน Promise.all เดียวกัน**
      ⚠️ ตัวที่อาจล้มได้ (core_meta ยังไม่ถูกสร้าง) ต้องมี .catch ของตัวเอง
         ไม่งั้นล้มตัวเดียวลากทั้งคำขอตาย — เดิมมันอยู่ใน try/catch แยก */
  // แท็บสถานะ = ทุกตัวกรองยกเว้นสถานะ (รวมตัวกรองค้นหาขั้นสูง ไม่งั้นเลขในแท็บตอบคนละคำถามกับตาราง)
  const wAll = buildWhere({ from, to, channel, q, includeCancelled: true, source, ...adv });
  const [
    sumRows, rows, chanStats, statusCountsRaw, byChannel, storeRows, byStatus,
    beatRows, chgRows, rngRows, retRows, retOrphanRows, retBeatRows,
  ] = await Promise.all([
    coreQuery(
      `SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s
       FROM orders WHERE ${w.sql}`,
      w.params
    ),
    /* ⚠️ เพิ่มคอลัมน์ในตารางแล้วต้องเพิ่มใน SELECT นี้ด้วย ไม่งั้นจอไม่มีวันเห็น
        (ฝั่งจอทักมา 4 ก.ย. 2569 — เก็บ integration_status เข้าฐานแล้วแต่แถวไม่มีฟิลด์นี้) */
    coreQuery(
      `SELECT id, source, number, channel, status, amount, customer, order_date, tracking_no, ship_channel, ship_name, ship_date, is_cod, pay_status, integration_status AS integrationStatus, tag, create_user, warehouse_code
       FROM orders WHERE ${w.sql}
       ORDER BY order_date DESC, number DESC
       LIMIT ${limit} OFFSET ${offset}`,
      w.params
    ),
    /* ⚠️ **เหตุผลที่ช่องนี้ว่าง ต้องติดมากับแถว ไม่ใช่ให้จอไปจับคู่ชื่อช่องทางเอง**
        เกณฑ์: ช่องทางนั้นมีค่าอยู่ **อย่างน้อย 5 ใบ และอย่างน้อย 1%** ⇒ ควรมีค่า แต่ใบนี้ไม่มี
        ⇒ source_empty (ต้นทางไม่ส่งมา) · ไม่ถึงเกณฑ์ ⇒ none_expected */
    coreQuery(
      `SELECT COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch,
              COUNT(*) AS total,
              SUM(CASE WHEN COALESCE(integration_status,'') <> '' THEN 1 ELSE 0 END) AS withVal
       FROM orders GROUP BY 1`
    ),
    // นับสถานะจัดส่งจากฐานทั้งช่วง (ไม่ใช่จากหน้าที่ตัดมาแล้ว)
    coreQuery(
      `SELECT COALESCE(integration_status,'') AS st,
              COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch,
              COUNT(*) AS c
       FROM orders WHERE ${w.sql} GROUP BY 1,2`,
      w.params
    ),
    // ยอดแยกช่องทางของ "ช่วงที่กรองอยู่" — ZORT ไม่มีให้ดูในจอเดียว แต่ร้านถามบ่อย
    coreQuery(
      `SELECT channel, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
       FROM orders WHERE ${w.sql}
       GROUP BY channel ORDER BY amount DESC`,
      w.params
    ),
    /* ยอดแยก "ร้าน" ของช่วงที่กรองอยู่ (ฝั่งจอขอ 5 ก.ย. 2569)
        ส่งรายการร้านที่มีอยู่จริง ไม่ใช่ประโยคสำเร็จรูป ⇒ ร้านที่สามโผล่มา ป้ายเปลี่ยนเอง */
    coreQuery(
      `SELECT source, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
       FROM orders WHERE ${w.sql}
       GROUP BY source ORDER BY source`,
      w.params
    ),
    /* ยอดแยก "สถานะ" — จอเอาไปทำแท็บพร้อมจำนวนในวงเล็บแบบ ZORT
       ⚠️ **นับใบยกเลิกด้วยเสมอ** ไม่งั้นแท็บ "ยกเลิก" จะหายไปจากจอทั้งที่มีอยู่จริง
          (เจอจริง 2 ก.ย. 2569: มี Voided 44 ใบ แต่จอไม่มีแท็บให้กด)
          แท็บคือ "สารบัญ" ของข้อมูลทั้งหมด ไม่ใช่ผลของตัวกรองที่เลือกอยู่ */
    coreQuery(
      `SELECT status, COUNT(*) AS orders, ROUND(COALESCE(SUM(amount),0),2) AS amount
       FROM orders WHERE ${wAll.sql}
       GROUP BY status ORDER BY orders DESC`,
      wAll.params
    ),
    /* ── อายุของข้อมูล ── ตารางชีพจรอาจยังไม่ถูกสร้าง (ต้องยิง ?init=1)
        ⇒ .catch คืนอาร์เรย์ว่าง **ห้ามให้ล้มลากทั้งคำขอ** */
    coreQuery(`SELECT at FROM core_meta WHERE k = 'sync_orders'`).catch(() => []),
    coreQuery(`SELECT MAX(updated_at) AS at FROM orders`).catch(() => []),
    coreQuery(`SELECT MAX(updated_at) AS at FROM orders WHERE ${w.sql}`, w.params).catch(() => []),
    /* ── ใบคืนของใบขายในขอบเขตเดียวกัน (15 ก.ย. 2569 · จอยอดขายขอ returnedAmount · t_mu1bkqes) ──
        จับคู่ return_orders_v2.reference = orders.number (วิธีเดียวกับที่ gucut2 วัด 14 ก.ย.)
        ⚠️ ต้องอ่าน **_v2 (กุญแจ id)** — ตารางเดิมกุญแจ number ทับกันหาย 152 ใบ (เลขใบคืนซ้ำได้ · 15 ก.ย. 2569)
        ⚠️ ใช้ IN (SELECT …) ไม่ใช่ JOIN — สองตารางมีคอลัมน์ชื่อซ้ำ (status · amount · customer)
           และ w.sql เขียนชื่อคอลัมน์ไม่มีคำนำหน้า ⇒ JOIN จะอ่านคอลัมน์ผิดตารางหรือล้ม
        ⚠️ ขอบเขต = ใบคืนของ "ใบขายที่อยู่ในตัวกรองนี้" (วันที่ขาย · ร้าน · ช่องทาง · สถานะ · คำค้น)
           ไม่ใช่ "ใบคืนที่ออกในช่วงนี้" — คนละคำถาม · ใบคืนยกเลิกไม่นับ
        ⚠️ ตารางยังไม่มี/อ่านไม่ได้ ⇒ null (ไม่รู้) ห้ามเป็น 0
        🔴 (15 ก.ย. 2569 · ใบ t_mu2pfve9) **ต้องจับคู่ร้านด้วย** — เลขที่ใบซ้ำข้ามร้านได้ · เดิมตารางใบคืนมีแต่ z1 จึงไม่ออกอาการ
           พอดึงใบคืนร้าน z2 เข้ามา ใบคืน z2 ที่เลขอ้างอิงตรงใบขาย z1 จะไปหักยอด z1 เงียบ ๆ ⇒ EXISTS + source ตรงกัน
           (ใช้ EXISTS ไม่ใช้ (source,reference) IN — ไม่แน่ใจว่า D1 รับ row value และถ้าล้มจะกลายเป็น null เงียบ) */
    coreQuery(
      `SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s FROM return_orders_v2
       WHERE EXISTS (SELECT 1 FROM orders WHERE orders.number = return_orders_v2.reference AND orders.source = return_orders_v2.source AND ${w.sql})
         AND COALESCE(status,'') NOT LIKE '%void%' AND COALESCE(status,'') NOT LIKE '%cancel%'`,
      w.params
    ).catch(() => null),
    /* ใบคืนที่ออกในช่วงวันนี้ แต่หาใบขายต้นทางในกระจกไม่เจอ — ไม่รู้ว่าเป็นของช่องทาง/ร้านไหน
        ⇒ ไม่ถูกหักในตัวเลขข้างบน ต้องบอกจอว่ามีกี่ใบ (ไม่ผูกตัวกรองร้าน/ช่องทาง เพราะไม่รู้) */
    coreQuery(
      `SELECT COUNT(*) AS c, ROUND(COALESCE(SUM(amount),0),2) AS s FROM return_orders_v2 r
       WHERE r.return_date >= ? AND r.return_date <= ?
         AND COALESCE(r.status,'') NOT LIKE '%void%' AND COALESCE(r.status,'') NOT LIKE '%cancel%'
         AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.number = r.reference AND o.source = r.source)`,
      [from, to]
    ).catch(() => null),
    coreQuery(`SELECT v, at FROM core_meta WHERE k = 'sync_returns'`).catch(() => null),
  ]);
  const sum = sumRows?.[0];

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

  /* ⚠️ **ต้องส่งสองเวลา ห้ามส่งอันเดียว** — มันตอบคนละคำถาม
        syncedAt  = ครั้งสุดท้ายที่ "เราไปดู ZORT" (ชีพจร · มีทุกรอบแม้เขียน 0 แถว)
        changedAt = ครั้งสุดท้ายที่ "ข้อมูลเปลี่ยนจริง" (MAX updated_at)
     ส่งแต่ changedAt อย่างเดียวจะหลอกตา: คืนที่ไม่มีออเดอร์ขยับเลย มันจะเก่าเป็นชั่วโมง
     ทั้งที่ซิงก์ทำงานปกติ ⇒ จอจะเตือนผิด แล้วคนจะเลิกเชื่อคำเตือน
     ⚠️ ทุกเวลาเป็น **UTC** ตามที่ SQLite เก็บ — ชื่อฟิลด์ลงท้าย Utc เพื่อไม่ให้เดาผิด */
  const freshness = {
    syncedAtUtc: beatRows?.[0]?.at ?? null,
    changedAtUtc: chgRows?.[0]?.at ?? null,
    rangeChangedAtUtc: rngRows?.[0]?.at ?? null,
  };

  return {
    from,
    to,
    limit,
    offset,
    status,
    advancedFilters: adv, // ค่าที่ใช้กรองจริง (null = ไม่กรอง) — จอเช็คก่อนเขียนว่ากรองแล้ว
    total: num(sum?.c),
    totalAmount: num(sum?.s),
    /* 🔴 **ขอบเขตของ `totalAmount` — เพิ่ม 6 ก.ย. 2569** (เพิ่มอย่างเดียว ไม่แตะค่าเดิม)
        ปัญหาที่เจอ: ในคำตอบเดียวกันนี้มี `storeScope` · `shipStatusScope` · `freshnessNote`
        ประกาศขอบเขตไว้ครบ **แต่ตัวเลขเงินซึ่งสำคัญที่สุดกลับไม่มีอะไรกำกับเลย**
        ⇒ `totalAmount` = ทุกสถานะ **ยกเว้น Voided** ⇒ **รวมใบที่ยังไม่จ่ายเข้ามาด้วย**
        วัดจริง 1 ม.ค.–6 ก.ย. 2569: หัวรายงาน ฿5,700,626 · เป็นใบยังไม่จ่าย ฿640,345
        ⇒ **บวมเกินจริง 11.2%** และเกือบทั้งหมดคือซากออเดอร์จากร้าน Shopify ที่ปิดไปแล้ว
           (ไม่มีวันได้เงิน) ⇒ ใครอ่านเป็น "ยอดขาย" จะเกินจริงเป็นแสน
        ⚠️ **ไม่แก้ `totalAmount` ให้หักออกเอง** — จอที่เทียบเลขนี้กับของเดิมจะเพี้ยนทันที
           และ "รวมใบค้างจ่าย" เป็นคำตอบที่ถูกสำหรับบางคำถาม (เช่น มูลค่าที่ออกบิลไปแล้ว)
           ⇒ ให้ **ตัวเลือกครบ พร้อมป้ายบอกว่าแต่ละตัวคืออะไร** แล้วให้จอเลือกใช้ */
    totalScope:
      "totalAmount = ทุกสถานะยกเว้น Voided ⇒ **รวมใบที่ยังไม่จ่าย** · " +
      "อยากได้ยอดที่ได้เงินจริงให้ใช้ totalPaidAmount",
    /* ⚠️ ต้องตัด **ทั้ง Voided และ Pending** ออกจากยอดที่ได้เงินจริง
        (เขียนรอบแรกตัดแต่ Pending ⇒ ใบที่ยกเลิกแล้ว ฿307,493 จะถูกนับเป็นเงินที่ได้รับ
         ซึ่ง **แย่กว่าปัญหาเดิมที่กำลังแก้อยู่** — จับได้ตอนอ่านซ้ำก่อน commit)
        ⚠️ `byStatus` รวม Voided อยู่ด้วย ต่างจาก `totalAmount` ที่ตัดออกแล้ว
           ⇒ บวกจาก byStatus ตรง ๆ ไม่ได้ ต้องคัดสถานะเองทุกครั้ง */
    totalPaidAmount: Math.round(
      (byStatus || []).reduce(
        (s, x) => s + (/pending|void|cancel/i.test(String(x.status)) ? 0 : num(x.amount)),
        0
      )
    ),
    /* ยอดคืน — ดูคำอธิบายขอบเขตที่ query · null = อ่านตารางใบคืนไม่ได้ (ไม่ใช่ไม่มีใบคืน) */
    returnedCount: retRows ? num(retRows[0]?.c) : null,
    returnedAmount: retRows ? num(retRows[0]?.s) : null,
    returnsScope:
      "returnedAmount = ใบคืน (ไม่รวมยกเลิก) ของใบขายที่อยู่ในตัวกรองนี้ จับคู่ return_orders_v2.reference = orders.number · " +
      "ยอดหลังหักคืน = totalAmount − returnedAmount · unmatchedReturns = ใบคืนที่ออกในช่วงวันนี้แต่หาใบขายต้นทางไม่เจอ (ไม่ถูกหัก · ไม่ผูกตัวกรองร้าน/ช่องทาง)",
    unmatchedReturns: retOrphanRows ? { count: num(retOrphanRows[0]?.c), amount: num(retOrphanRows[0]?.s) } : null,
    // ชีพจรซิงก์ใบคืน (UTC) · null = ยังไม่เคยซิงก์/อ่านไม่ได้ ⇒ ยอดคืนเชื่อไม่ได้ว่าสด
    returnsSyncedAtUtc: retBeatRows?.[0]?.at ?? null,
    returnsSyncComplete: retBeatRows?.[0] ? String(retBeatRows[0].v) === "complete" : null,
    totalUnpaidAmount: Math.round(
      (byStatus || []).reduce((s, x) => s + (/pending/i.test(String(x.status)) ? num(x.amount) : 0), 0)
    ),
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
    rows: rows.map((r) => decorateOrderRow(r, chanMap)),
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
        /* ใช้ฟังก์ชันกลางตัวเดียวกับฝั่งแถว — ห้ามเขียนนิพจน์ซ้ำที่นี่ */
        blankReason: blankReasonFor(r.st, r.ch, chanMap),
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
  /* bill_discount · ship_amount · items[].discount — gucut2 ขอ 14 ก.ย. 2569 (จอใบขายเจอยอดบรรทัด ≠ ยอดใบ 5/60 ใบ)
     กระจกเก็บสามช่องนี้มาตั้งแต่ 4986ace (5 ก.ย. 2569) แต่ใบเดียวไม่เคยส่งออก
     สูตรที่พิสูจน์แล้ว (coredb.mjs): หัวใบ = ผลรวมบรรทัด − bill_discount + ship_amount
     ⚠️ ส่งค่าดิบ ห้ามแปลง null เป็น 0 — แถวที่ซิงก์ก่อนมีคอลัมน์อาจยังว่าง = ไม่รู้ ไม่ใช่ศูนย์ */
  const [order] = await coreQuery(
    `SELECT id, source, number, channel, status, amount, customer, order_date, tracking_no, ship_channel, ship_name, ship_date, is_cod, pay_status,
            bill_discount, ship_amount, tag, create_user, warehouse_code, updated_at
     FROM orders WHERE id = ?`,
    [key]
  );
  if (!order) return { error: "ไม่พบใบนี้ในคลังเงา" };
  const items = await coreQuery(
    `SELECT line, sku, name, qty, amount, discount FROM order_items
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
  const src = parseStore(source).source ?? null;
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
    parts.push(`(${contains("tracking_no")} OR ${contains("number")} OR ${contains("ship_name")})`);
    params.push(q, q, q);
  }
  /* ⚠️ **ขอบเขตของจอนี้คือ "ใบที่มีการส่งของ" ไม่ใช่ออเดอร์ทั้งหมด**
      รอบแรกผมกวาดทุกแถวในตาราง orders มาแสดง = 12,127 ใบ ทั้งที่ ZORT มี 1,644
      เพราะในนั้นมีใบรับของ (RC-*) และออเดอร์เก่าที่ไม่เคยมีการส่งปนมาด้วย
      ⇒ นับเฉพาะใบที่มีร่องรอยการส่งจริง (มีเลขพัสดุ หรือระบุขนส่งไว้) */
  const SCOPE = `(COALESCE(tracking_no,'') <> '' OR COALESCE(ship_channel,'') <> '')`;
  parts.push(SCOPE);
  /* 📅 ช่วงวันที่ + 🚚 ขนส่ง (gucut2 17 ก.ย. 2569) — เดิมเมินเงียบ จอจึงทำตัวกรองแบบ ZORT ไม่ได้
     วันที่ = **วันเดียวกับคอลัมน์ "วันที่" ของแถว** (วันส่ง ถ้าไม่มีใช้วันสั่ง) ⇒ กรองกับที่ตาเห็นตรงกัน
     ตัดเหลือ 10 ตัวแรกก่อนเทียบ — ถ้าช่องมีเวลาต่อท้าย `<= 'yyyy-mm-dd'` จะตัดวันสุดท้ายทิ้งเงียบ ๆ */
  const DATE = `substr(COALESCE(NULLIF(ship_date,''), order_date),1,10)`;
  const from = isRealDay(o.from) ? o.from : null;
  const to = isRealDay(o.to) ? o.to : null;
  if (from) { parts.push(`${DATE} >= ?`); params.push(from); }
  if (to) { parts.push(`${DATE} <= ?`); params.push(to); }
  /* ขนส่ง: รับ **ชื่อกลุ่ม** (Flash · Kerry …) หรือ **ชื่อดิบ** ก็ได้ — ตัดสินจาก byChannel ของขอบเขตเดียวกัน
     ⇒ ชื่อสะกดแปลกที่รวมเข้ากลุ่มแล้วก็ถูกกรองด้วย ไม่หลุดเงียบ · ไม่รู้จักเลย ⇒ ไม่กรอง + บอกใน ignored */
  const carrierAsked = String(o.carrier ?? "").trim().slice(0, 60) || null;
  let carrierUsed = null;
  if (carrierAsked) {
    const pre = await coreQuery(
      `SELECT COALESCE(NULLIF(ship_channel,''),'(ยังไม่ระบุขนส่ง)') AS channel, COUNT(*) AS c
       FROM orders WHERE ${parts.join(" AND ")}
       GROUP BY COALESCE(NULLIF(ship_channel,''),'(ยังไม่ระบุขนส่ง)')`,
      params
    );
    const { groupCarriers } = await import("./carriers.mjs");
    const g = groupCarriers(pre).groups.find((x) => x.carrier === carrierAsked);
    const raw = g ? g.names.map((n) => n.name) : pre.some((r) => r.channel === carrierAsked) ? [carrierAsked] : [];
    // เพดานตัวแปรผูกค่า D1 = 100 — กลุ่มหนึ่งมีชื่อสะกดไม่กี่แบบ แต่กันไว้ไม่ให้พังทั้งเส้น
    if (raw.length && raw.length <= 60) {
      parts.push(`COALESCE(NULLIF(ship_channel,''),'(ยังไม่ระบุขนส่ง)') IN (${raw.map(() => "?").join(",")})`);
      params.push(...raw);
      carrierUsed = carrierAsked;
    }
  }
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
  const ignoredMsgs = [
    known ? null : `ไม่รู้จักตัวกรอง "${asked}" — แสดงทั้งหมดแทน`,
    carrierAsked && !carrierUsed ? `ไม่รู้จักขนส่ง "${carrierAsked}" ในช่วงนี้ — ไม่ได้กรองขนส่ง` : null,
  ].filter(Boolean);
  return {
    total: num(sum?.c),
    shown: num(shownRow?.c),
    shipped: num(sum?.shipped),
    unshipped: num(sum?.unshipped),
    cod: num(sum?.cod),
    limit,
    offset,
    only: usedOnly,
    applied: { only: usedOnly, limit, offset, q: q || null, from, to, carrier: carrierUsed },
    dateBasis: "วันส่งสินค้า ถ้าไม่มีใช้วันที่สั่ง (ตรงกับคอลัมน์วันที่ของแถว)",
    ...(ignoredMsgs.length ? {
      ignored: { ...(known ? {} : { only: asked }), ...(carrierAsked && !carrierUsed ? { carrier: carrierAsked } : {}) },
    } : {}),
    byChannel, // ชื่อดิบ — ห้ามถอด กลุ่มเป็นของสำหรับอ่าน ไม่ใช่ของแทนความจริง
    carrierGroups: carrierGroups.groups,
    // ⚠️ ตาข่าย: ขนส่งเจ้าใหม่ที่ยังไม่รู้จักจะโผล่ตรงนี้ ไม่ถูกยัดเข้ากลุ่มอื่นมั่ว ๆ
    carrierUngrouped: carrierGroups.ungrouped,
    carrierUngroupedNames: carrierGroups.ungroupedNames,
    /* ⚠️ **จอต้องบอกขอบเขตให้ชัด** — เขียนว่า "เท่าที่เก็บได้" ห้ามเขียนว่าเป็นทั้งหมด
       🔴 คอมเมนต์เดิมตรงนี้เขียนว่า "ตัวเลขนี้ยังน้อยกว่าที่ ZORT แสดง (1,644 ใบ)" ซึ่ง **ไม่จริงแล้ว**
          และขัดกับ `note` ในฟังก์ชันเดียวกันที่แก้ไปตั้งแต่ 17 ก.ย. ⇒ ลบทิ้ง 18 ก.ย. 2569
          คำอธิบายที่ค้างอยู่ในโค้ดอันตรายกว่าตัวเลขค้าง เพราะคนรอบหน้าอ่านแล้วเชื่อโดยไม่ไปวัดซ้ำ */
    coversFrom: "เริ่มเก็บข้อมูลขนส่ง 3 ก.ย. 2569",
    /* เลขที่จอ ZORT แสดง — **ค่าที่วัดด้วยมือ ต้องมีวันที่กำกับเสมอ**
       17 ก.ย. 2569 วัดได้ 1,665 · **18 ก.ย. 2569 เปิดจอ `/Logistics/list` อ่านเองได้ 1,666**
       🔑 พิสูจน์แล้ว 18 ก.ย. ว่าเป็น **ชุดย่อยของเรา ไม่ใช่คนละชุดลอย ๆ**: สุ่มเลขพัสดุจากจอ ZORT 3 ใบ
          (TH0703… · TH4714… · TH2723…) ค้นในกระจกเจอครบ 3/3 เป็นใบ SO-2026090xx ขนส่ง Flash express
       ⇒ ZORT นับ "พัสดุที่ร้านจองผ่าน L Shipping Point ของ ZORT เอง" · เรานับ "ทุกใบที่มีร่องรอยการส่ง"
          รวมมาร์เก็ตเพลสที่แพลตฟอร์มส่งเอง ⇒ **คนละประชากรโดยนิยาม เทียบเลขตรง ๆ ไม่ได้** */
    zortShows: 1666,
    zortShowsAt: "2026-09-18",
    /* 🔴 คำเตือนตัวกรองที่ไม่ได้ใช้ต้องมาก่อน — เดิม `note` ข้างล่างเขียนทับ note ของ ignored เงียบ ๆ
          (ไม่รู้จัก only ⇒ คำเตือนหายทุกครั้ง · เทสต์ logistics-date-carrier จับได้ 17 ก.ย. 2569) */
    note: [...ignoredMsgs,
      "อ่านจากกระจกออเดอร์ — ZORT ไม่มี API ขนส่งแยก · " +
      "นับเฉพาะใบขายที่มีร่องรอยการส่ง (มีเลขพัสดุหรือระบุขนส่ง) ไม่ใช่ออเดอร์ทั้งหมด · " +
      "คนละหน่วยนับกับจอ ZORT (ZORT นับการจองขนส่งผ่าน ZORT) ⇒ เลขของเรามากกว่ามาก เทียบกันตรง ๆ ไม่ได้"].join(" · "),
    rows: rows.map((r) => ({ ...r, isCod: num(r.isCod) === 1 })),
  };
}
