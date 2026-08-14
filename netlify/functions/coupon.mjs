// ตรวจโค้ดส่วนลด — /api/coupon
//
// ⚠️ ต้องตรวจที่นี่เท่านั้น ห้ามย้ายไปตรวจในเบราว์เซอร์
//    ถ้าเก็บรายชื่อโค้ดไว้ในหน้าเว็บ ลูกค้ากด "ดูซอร์ส" ก็เห็นโค้ดทั้งหมด
//    แล้วเอาไปแจกกันได้ทันที
//
// รายชื่อโค้ดอยู่ที่ตัวแปรลับ COUPON_CODES ของ Netlify — เป็น JSON array
//   [
//     { "code": "GUCUT100", "type": "amount",  "value": 100, "min": 1000 },
//     { "code": "SAVE10",   "type": "percent", "value": 10,  "min": 500, "max": 300 },
//     { "code": "NEWYEAR",  "type": "amount",  "value": 200, "until": "2026-12-31" }
//   ]
//   type   amount = ลดเป็นบาท · percent = ลดเป็นเปอร์เซ็นต์
//   min    ยอดขั้นต่ำถึงจะใช้ได้ (ไม่ใส่ = ไม่มีขั้นต่ำ)
//   max    เพดานส่วนลด ใช้กับ percent (ไม่ใส่ = ไม่มีเพดาน)
//   until  วันสุดท้ายที่ใช้ได้ YYYY-MM-DD (ไม่ใส่ = ไม่มีวันหมดอายุ)
//
// ยังไม่ตั้ง COUPON_CODES = ไม่มีโค้ดไหนใช้ได้ (ตอบว่าไม่มีโค้ดนี้ตามปกติ)
import { getStore } from "@netlify/blobs";

const MAX_TRIES = 20;                 // ลองผิดได้กี่ครั้งต่อ IP
const WINDOW_MS = 10 * 60 * 1000;     // ในช่วงเวลาเท่านี้

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

const who = (req, context) =>
  context?.ip ||
  req.headers.get("x-nf-client-connection-ip") ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

function rules() {
  try {
    const list = JSON.parse(process.env.COUPON_CODES || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];   // JSON พิมพ์ผิด — ถือว่าไม่มีโค้ด ดีกว่าทำให้หน้าสั่งซื้อพัง
  }
}

export default async function handler(req, context) {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const code = String(body.code ?? "").trim().toUpperCase().slice(0, 40);
  const subtotal = Number(body.subtotal);
  if (!code) return json({ ok: false, error: "ใส่โค้ดส่วนลดก่อนครับ" });
  if (!Number.isFinite(subtotal) || subtotal <= 0) return json({ error: "bad subtotal" }, 400);

  // กันยิงเดาโค้ดรัว ๆ — นับแยกตาม IP
  const ip = who(req, context);
  let store = null;
  try { store = getStore({ name: "gucut-coupon", consistency: "strong" }); } catch { /* Blobs ล่ม ปล่อยผ่าน */ }
  if (store) {
    const now = Date.now();
    const rl = (await store.get(`rl/${ip}`, { type: "json" }).catch(() => null)) || { n: 0, start: now };
    if (now - rl.start > WINDOW_MS) { rl.n = 0; rl.start = now; }
    if (rl.n >= MAX_TRIES) {
      return json({ ok: false, error: "ลองใส่โค้ดบ่อยเกินไป รออีกสักครู่แล้วลองใหม่" });
    }
    rl.n += 1;
    await store.setJSON(`rl/${ip}`, rl).catch(() => {});
  }

  const r = rules().find((x) => String(x.code ?? "").trim().toUpperCase() === code);
  if (!r) return json({ ok: false, error: "ไม่มีโค้ดนี้ หรือโค้ดหมดอายุแล้ว" });

  if (r.until) {
    // หมดอายุตอนสิ้นวันตามเวลาไทย (UTC+7)
    const end = new Date(`${r.until}T23:59:59+07:00`).getTime();
    if (Number.isFinite(end) && Date.now() > end) {
      return json({ ok: false, error: "โค้ดนี้หมดอายุแล้ว" });
    }
  }
  if (r.min && subtotal < r.min) {
    return json({ ok: false, error: `โค้ดนี้ใช้ได้เมื่อซื้อครบ ฿${Number(r.min).toLocaleString("th-TH")}` });
  }

  let discount =
    r.type === "percent" ? Math.floor((subtotal * Number(r.value)) / 100) : Math.floor(Number(r.value));
  if (r.type === "percent" && r.max) discount = Math.min(discount, Number(r.max));
  discount = Math.max(0, Math.min(discount, subtotal));   // ลดเกินยอดไม่ได้ และติดลบไม่ได้
  if (!discount) return json({ ok: false, error: "โค้ดนี้ใช้กับยอดนี้ไม่ได้" });

  return json({
    ok: true,
    code,
    discount,
    label: r.type === "percent" ? `ลด ${r.value}%` : `ลด ฿${Number(r.value).toLocaleString("th-TH")}`,
  });
}

export const config = { path: "/api/coupon" };
