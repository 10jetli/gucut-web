// เก็บของใน ZORT ที่ **ไม่มี API** ให้ดึงออก — ก่อนวันปิดบัญชี (โครงการแก่น ขั้นสุดท้าย)
//
// ⚠️ **นี่คืองานที่มีเส้นตายจริง** ยิง endpoint ของ ZORT ทดสอบครบแล้ว (3 ก.ย. 2569)
//    ของกองนี้ 404 ทุกทาง: กระเป๋าเงิน · การรับเงิน · ใบเสร็จ · ไฟล์แนบ/สลิป · รายได้อื่น
//    · รายจ่ายอื่น · รายการโอนเงิน · บัญชีธนาคาร · การรับคืนสินค้า · ผู้ใช้ · สาขา
//    · ลำดับหมวดหมู่ · รายการรับเงิน COD · ใบ "ปรับ" ในรายการโอนสินค้า
//    **วันที่ปิดบัญชี ZORT คือวันที่ของพวกนี้หายถาวร** — กดทีหลังไม่ได้ เข้าหน้าจอไม่ได้แล้ว
//
// วิธีเก็บ: หน้าจอ ZORT วาดข้อมูลเป็นตาราง HTML ธรรมดา ⇒ อ่านจากหน้าเว็บที่ล็อกอินอยู่
// แล้วยิงมาที่นี่ **ตรงจากเบราว์เซอร์** (ข้อมูลไม่ผ่านมือใครระหว่างทาง)
//
// ⚠️ **ข้อมูลกองนี้อ่อนไหว** — มีเลขบัญชีธนาคาร ยอดเงิน ชื่อผู้ใช้
//    ① เก็บที่ Netlify Blobs ถังปิด (`gucut-zort-archive`) เท่านั้น ห้ามไป R2 (ถังนั้นเปิดสาธารณะ)
//    ② อ่านกลับได้เฉพาะมีรหัสหลังร้าน · ห้ามมี endpoint ไหนคืนข้อมูลนี้แบบไม่ต้องมีรหัส
//    ③ **ห้าม log เนื้อข้อมูล ห้ามส่งเข้า Telegram** — แจ้งได้แค่ "เก็บจอไหน กี่แถว"
//
// ⚠️ **เก็บแล้วต้องรู้ว่าครบไหม** — หน้าจอ ZORT บอกจำนวนรวมไว้บนหัวตารางเสมอ
//    (เช่น "จำนวน 46 รายการ") ⇒ ผู้ยิงต้องส่ง `expected` มาด้วย แล้วที่นี่เทียบให้
//    ไม่ตรง = ตอบ `complete:false` **ห้ามเก็บเงียบ ๆ แล้วบอกว่าสำเร็จ**
//    (บทเรียน sampling-is-not-proof: ของที่เอาคืนไม่ได้ ต้องตรวจครบ ไม่ใช่สุ่ม)
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const STORE = "gucut-zort-archive";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/** ชื่อจอที่รับ — จำกัดรายชื่อไว้ ไม่ให้ยิงชื่ออะไรก็ได้เข้ามากองในถัง */
const SCREENS = new Set([
  "wallet",          // กระเป๋าเงิน
  "income",          // รายได้อื่น
  "expense",         // รายจ่ายอื่น
  "transfer",        // รายการโอนเงิน
  "cod",             // รายการรับเงิน COD
  "receipt",         // ใบเสร็จ / การรับเงิน
  "bank",            // บัญชีธนาคาร
  "return",          // การรับคืนสินค้า
  "user",            // ผู้ใช้
  "branch",          // สาขา
  "category-order",  // ลำดับหมวดหมู่
  "stock-adjust",    // ใบ "ปรับ" ในรายการโอนสินค้า
  "attachment",      // รายการไฟล์แนบ (ตัวไฟล์จริงยังไม่เก็บ — ดูหมายเหตุท้ายไฟล์)
]);

export default async function handler(req, context) {
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  const store = getStore({ name: STORE, consistency: "strong" });
  const url = new URL(req.url);

  // ── ดูว่าเก็บอะไรไปแล้วบ้าง (ไม่คืนเนื้อข้อมูล) ──
  if (req.method === "GET" && !url.searchParams.get("screen")) {
    const { blobs } = await store.list();
    const items = [];
    for (const b of blobs) {
      const meta = await store.getMetadata(b.key).catch(() => null);
      items.push({
        key: b.key,
        rows: Number(meta?.metadata?.rows ?? 0),
        expected: Number(meta?.metadata?.expected ?? 0),
        complete: String(meta?.metadata?.complete ?? "") === "1",
        at: meta?.metadata?.at ?? null,
      });
    }
    const missing = [...SCREENS].filter((s) => !items.some((i) => i.key === `t/${s}`));
    return json({
      ok: true,
      saved: items.sort((a, b) => a.key.localeCompare(b.key)),
      /* ⚠️ "ยังไม่ได้เก็บ" ต้องเห็นเป็นรายการ ไม่ใช่ให้คนไปนับเอาเองว่าขาดอะไร
          รายการที่ยังไม่มี = งานที่ต้องทำก่อนปิดบัญชี ZORT */
      notYet: missing,
      note: "จอที่ไม่มีใน notYet และ complete:true เท่านั้นที่ถือว่าเก็บครบแล้ว",
    });
  }

  // ── อ่านของจอเดียว (ต้องระบุชื่อจอ) ──
  if (req.method === "GET") {
    const screen = String(url.searchParams.get("screen"));
    if (!SCREENS.has(screen)) return json({ error: `ไม่รู้จักจอ ${screen}`, accepts: [...SCREENS] }, 400);
    const data = await store.get(`t/${screen}`, { type: "json" }).catch(() => null);
    if (!data) return json({ error: "ยังไม่ได้เก็บจอนี้" }, 404);
    return json({ ok: true, ...data });
  }

  if (req.method !== "POST") return json({ error: "ใช้ได้เฉพาะ GET กับ POST" }, 405);

  const body = await req.json().catch(() => null);
  const screen = String(body?.screen ?? "");
  if (!SCREENS.has(screen)) return json({ error: `ไม่รู้จักจอ ${screen}`, accepts: [...SCREENS] }, 400);

  const head = Array.isArray(body?.head) ? body.head.map((h) => String(h)) : [];
  const rows = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) return json({ error: "ไม่มีแถวส่งมา" }, 400);

  /* ⚠️ **จำนวนที่หน้าจอ ZORT บอก คือตัวหารเดียวที่เชื่อได้**
      ผู้ยิงต้องอ่านเลขนั้นมาส่งด้วย ไม่ใช่ให้เราเดาจากจำนวนแถวที่ได้รับ
      ไม่ส่งมา = เก็บได้ แต่ **ติดธงว่ายังพิสูจน์ความครบไม่ได้** */
  const expected = Number(body?.expected ?? 0);
  const complete = expected > 0 && rows.length === expected;

  const payload = {
    screen,
    head,
    rows,
    rowCount: rows.length,
    expected: expected || null,
    complete,
    source: String(body?.source ?? "").slice(0, 200), // path ของจอที่อ่านมา
    at: new Date().toISOString(),
  };

  await store.setJSON(`t/${screen}`, payload, {
    metadata: {
      rows: String(rows.length),
      expected: String(expected || 0),
      complete: complete ? "1" : "0",
      at: payload.at,
    },
  });

  /* ⚠️ ตอบกลับต้องบอกความจริงเรื่องความครบ **ห้ามตอบ ok เฉย ๆ**
      ผู้ยิงจะได้รู้ทันทีว่าต้องกลับไปเปิดหน้าถัดไปหรือขยาย PageSize ก่อน */
  return json({
    ok: true,
    screen,
    rows: rows.length,
    expected: expected || null,
    complete,
    warn: complete
      ? null
      : `ยังไม่ครบ — จอบอก ${expected || "?"} แถว แต่ส่งมา ${rows.length} แถว (ตั้ง PageSize ให้ครอบคลุมก่อนยิงใหม่)`,
  });
}

/* ⚠️ **ยังไม่ครอบคลุมไฟล์แนบตัวจริง** (สลิป 376 ใบ) — ตัวนี้เก็บได้แค่ "รายการ" ของไฟล์
    ตัวไฟล์เป็นรูปที่ต้องโหลดทีละใบ ซึ่งเป็นงานคนละแบบ (ขนาดใหญ่ · ต้องขออนุญาตดาวน์โหลด)
    เขียนไว้ตรงนี้เพื่อไม่ให้เข้าใจผิดว่า "เก็บครบแล้ว" — ดู [[zort-export-before-close]] */

export const config = { path: "/api/zort-archive" };
