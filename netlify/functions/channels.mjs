// ── เส้นจัดการรายชื่อช่องทางขายที่ปิดไปแล้ว — /api/channels (ต้องมี x-admin-key) ──────
//
// CEO อนุมัติที่เก็บตามที่เสนอ 12 ก.ย. 2569 · กติกาทั้งหมดอยู่ที่ netlify/lib/closed-channels.mjs
//
//   GET    /api/channels                         → รายชื่อที่ปิดแล้ว + ช่องทางที่เงียบนาน (ข้อเสนอ)
//   POST   /api/channels  {channel, closedAt|null, note?, by?}  → เพิ่ม/แก้
//   DELETE /api/channels?channel=…               → ถอนออกจากรายชื่อ (แก้กรณีบันทึกผิด)
//
// 🔴 **ไฟล์ใหม่แยกออกมาโดยตั้งใจ — ไม่แตะ core.mjs** (Codex ถืออยู่ 12 ก.ย. 2569)
// 🔴 **ห้ามให้เส้นนี้เขียนรายชื่อเองอัตโนมัติ** (CEO สั่ง) — ปิดร้านเป็นเรื่องธุรกิจที่
//    ท่านประธานเท่านั้นรู้ · GET จึงมีช่อง `suggest` ที่บอกว่า "ช่องทางไหนเงียบนานแล้ว
//    ยังไม่อยู่ในรายชื่อ" **เป็นข้อเสนอเท่านั้น ไม่เพิ่มให้**
//    ⚠️ และห้ามเอาวันใบล่าสุดไปใส่ closedAt เอง — นั่นคือ **ขอบล่าง** ของวันปิด ไม่ใช่วันปิด
//       (ใบ ZAMA ใบสุดท้าย 21 ก.พ. 2569 ⇒ ปิดไม่ก่อนวันนั้น แต่ปิดวันไหนต้องให้ท่านยืนยัน)
import { adminGate } from "../lib/admin-gate.mjs";
import {
  loadClosedChannels, saveClosedChannels, putClosedChannel, removeClosedChannel, thaiToday,
} from "../lib/closed-channels.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

/** ช่องทางที่เงียบเกิน N วัน — ใช้เป็น **ตัวตรวจประกบ** ไม่ใช่ตัวตัดสิน
 *  ⚠️ อ่านจากกระจกของเราเอง (ตาราง orders) ⇒ ถ้าตัวซิงก์หยุด ทุกช่องทางจะดู "เงียบ" พร้อมกัน
 *     ⇒ คืนวันใบล่าสุดของ **ทั้งระบบ** มาด้วย ผู้อ่านจะได้แยก "ช่องทางเงียบ" ออกจาก "ระบบหยุด" ได้ */
async function silentChannels(closed, days = 90) {
  const { coreReady, coreQuery } = await import("../lib/coredb.mjs");
  if (!coreReady()) return { skip: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
  const rows = await coreQuery(
    `SELECT source, COALESCE(NULLIF(channel,''),'(ไม่ระบุ)') AS ch,
            MAX(order_date) AS lastOrder, COUNT(*) AS orders
     FROM orders GROUP BY 1,2 ORDER BY lastOrder DESC`
  );
  const today = thaiToday();
  const ageOf = (d) =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(d ?? ""))
      ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 864e5)
      : null;
  const all = rows.map((r) => ({
    store: r.source, channel: String(r.ch), lastOrder: r.lastOrder,
    silentDays: ageOf(r.lastOrder), orders: Number(r.orders) || 0,
    inClosedList: Object.prototype.hasOwnProperty.call(closed, String(r.ch)),
  }));
  return {
    newestOrderAnywhere: all.reduce((m, r) => (r.lastOrder > (m ?? "") ? r.lastOrder : m), null),
    channels: all,
    /* ข้อเสนอ: เงียบนานแต่ยังไม่อยู่ในรายชื่อ — **คนต้องกดเอง** */
    suggest: all.filter((r) => (r.silentDays ?? 0) > days && !r.inClosedList),
    suggestNote:
      `เงียบเกิน ${days} วันและยังไม่อยู่ในรายชื่อ — **เป็นข้อเสนอ ไม่ใช่คำตัดสิน** ` +
      "วันใบล่าสุดคือ *ขอบล่าง* ของวันปิดร้าน ไม่ใช่วันปิด ⇒ ต้องให้เจ้าของร้านยืนยันก่อนบันทึก",
  };
}

export default async function handler(req, context) {
  // adminGate คืน { wants, ok, deny } ไม่ใช่ Response — ต้องเช็คสองชั้นเสมอ
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  const url = new URL(req.url);

  if (req.method === "GET") {
    let closed;
    try {
      closed = await loadClosedChannels();
    } catch (e) {
      /* 🔴 อ่านไม่ได้ ≠ ไม่มีช่องทางปิด — ต้องบอกให้ผู้เรียกรู้ ห้ามคืนก้อนว่าง */
      return json({ error: `อ่านรายชื่อไม่สำเร็จ: ${String(e?.message ?? e)}` }, 503);
    }
    const days = Math.max(30, Math.min(720, parseInt(url.searchParams.get("silent") ?? "90", 10) || 90));
    let survey = null;
    try {
      survey = await silentChannels(closed, days);
    } catch (e) {
      survey = { error: String(e?.message ?? e) };
    }
    return json({
      ok: true,
      closedChannels: closed,
      count: Object.keys(closed).length,
      survey,
      rules:
        "เทียบชื่อช่องทางตรงตัวเท่านั้น (ห้าม includes) · ห้ามกรองแถวของช่องทางที่ปิดทิ้ง " +
        "ทำได้แค่แยกบรรทัด · closedAt = วันที่ร้านปิดจริง (null = ยังไม่รู้) · " +
        "recordedAt = วันที่เราบันทึก · closedAt เป็น null ⇒ การตรวจ 'ใบใหม่กว่าวันปิด' ตอบว่าตรวจไม่ได้",
    });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "อ่าน body เป็น JSON ไม่ได้" }, 400);
    /* ⚠️ ต้องส่ง closedAt มาให้ชัดว่า "รู้" (วันที่) หรือ "ไม่รู้" (null)
       ไม่ส่งมาเลย = ตีกลับ ไม่เดาแทน (เดาแทนครั้งเดียวได้ข้อเท็จจริงปลอมถาวร) */
    if (!("closedAt" in body)) {
      return json({ error: "ต้องส่ง closedAt มาด้วย — ใส่วันที่ (YYYY-MM-DD) ถ้ารู้ หรือ null ถ้ายังไม่รู้" }, 400);
    }
    let closed;
    try { closed = await loadClosedChannels(); } catch (e) {
      return json({ error: `อ่านรายชื่อเดิมไม่สำเร็จ จึงยังไม่เขียนทับ: ${String(e?.message ?? e)}` }, 503);
    }
    const r = putClosedChannel(closed, body);
    if (r.error) return json({ error: r.error }, 400);
    await saveClosedChannels(r.map);
    return json({ ok: true, closedChannels: r.map, saved: body.channel });
  }

  if (req.method === "DELETE") {
    const ch = url.searchParams.get("channel");
    if (!ch) return json({ error: "ต้องมี ?channel=" }, 400);
    let closed;
    try { closed = await loadClosedChannels(); } catch (e) {
      return json({ error: `อ่านรายชื่อเดิมไม่สำเร็จ: ${String(e?.message ?? e)}` }, 503);
    }
    const r = removeClosedChannel(closed, ch);
    if (r.error) return json({ error: r.error }, 404);
    await saveClosedChannels(r.map);
    return json({ ok: true, closedChannels: r.map, removed: ch });
  }

  return json({ error: "ใช้ได้เฉพาะ GET · POST · DELETE" }, 405);
}

// ⚠️ ฟังก์ชันฝั่งนี้ต้องประกาศ path เอง — ลืมแล้วจะตกไปที่หน้า 404 ของหน้าร้าน
//    ซึ่งตอบ HTTP 200 พร้อม HTML ⇒ หน้าตาเหมือน "เส้นมีจริงแต่ตอบแปลก" ไม่ใช่ "ไม่มีเส้น"
export const config = { path: "/api/channels" };
