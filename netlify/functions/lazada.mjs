// ทางเข้า Lazada — ต่อร้านครั้งเดียว แล้วใช้ดึงข้อมูลได้ตลอด
//
//   GET /api/lazada/auth      (ต้องมี x-admin-key) → ลิงก์ให้เจ้าของร้านกดอนุญาต
//   GET /api/lazada/callback  ← Lazada ส่งกลับมาที่นี่หลังร้านกดอนุญาต (เปิดโล่ง ต้องเปิดได้)
//   GET /api/lazada/status    (ต้องมี x-admin-key) → เชื่อมร้านแล้วหรือยัง
//   GET /api/lazada/products  (ต้องมี x-admin-key) → ลองดึงสินค้าที่ลงขายจริงมาดู
//   GET /api/lazada/fields    (ต้องมี x-admin-key) → ชื่อฟิลด์จริงที่ Lazada ส่งมาต่อ SKU
//
// ⚠️ /callback ต้องเปิดโล่ง คนเรียกคือเซิร์ฟเวอร์ Lazada ไม่ใช่เบราว์เซอร์ของร้าน
//    ปลอดภัยเพราะ code ใช้ได้ครั้งเดียวและต้องคู่กับ app_secret
// ⚠️ adminGate คืน { wants, ok, deny } ไม่ใช่ Response — ต้องเช็ค gate.ok เองเสมอ
import { adminGate } from "../lib/admin-gate.mjs";
import { lazadaReady, authLink, exchangeCode, loadToken, validToken, listedSkus, lazadaSkuFields } from "../lib/lazada.mjs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export default async function handler(req, context) {
  const url = new URL(req.url);
  const step = url.pathname.split("/").filter(Boolean).pop();

  if (!lazadaReady()) return json({ error: "ยังไม่ได้ตั้ง LAZADA_APP_KEY / LAZADA_APP_SECRET" }, 503);

  // ── ทางกลับจาก Lazada — เปิดโล่งโดยตั้งใจ ──
  if (step === "callback") {
    const code = url.searchParams.get("code");
    if (!code) return json({ error: "ไม่มี code" }, 400);
    try {
      await exchangeCode(code);
      return new Response(
        "<meta charset='utf-8'><h2>✅ เชื่อมร้าน Lazada สำเร็จแล้ว</h2><p>ปิดหน้านี้ได้เลย</p>",
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    } catch (e) {
      return json({ error: String(e?.message || e) }, 400);
    }
  }

  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (step === "auth") return json({ link: authLink() });

  if (step === "status") {
    const t = await loadToken();
    return json({
      connected: Boolean(t?.accessToken),
      account: t?.account || null,
      country: t?.country || null,
      // ⚠️ บอกวันหมดอายุด้วย — token อายุแค่ 7 วัน จอจะได้เตือนก่อนหลุด
      expiresAt: t?.expiresAt ? new Date(t.expiresAt).toISOString() : null,
      savedAt: t?.savedAt || null,
    });
  }

  if (step === "products") {
    const t = await validToken();
    if (!t) return json({ error: "ยังไม่ได้เชื่อมร้าน — เปิด /api/lazada/auth ก่อน" }, 400);
    try {
      const skus = await listedSkus();
      return json({ ok: true, listed: skus.size, skus: [...skus].slice(0, 50) });
    } catch (e) {
      return json({ error: String(e?.message || e) }, 400);
    }
  }

  /* ดูชื่อฟิลด์จริงที่ Lazada ส่งมา — ก่อนทำตัวเทียบสต็อกต้องรู้ก่อนว่าเขาเรียกอะไรว่าอะไร
     ⚠️ **ห้ามเดาชื่อฟิลด์แล้วเขียนตัวเทียบเลย** — เดาผิดจะได้ผลลัพธ์ที่ดูสมเหตุสมผล
        (สต็อกตรงกันหมด เพราะอ่าน undefined ทั้งสองฝั่ง) แล้วไม่มีใครจับได้ */
  if (step === "fields") {
    const t = await validToken();
    if (!t) return json({ error: "ยังไม่ได้เชื่อมร้าน — เปิด /api/lazada/auth ก่อน" }, 400);
    try {
      return json({ ok: true, ...(await lazadaSkuFields(3)) });
    } catch (e) {
      return json({ error: String(e?.message || e) }, 400);
    }
  }

  return json({ error: "ไม่รู้จักคำสั่งนี้ — ใช้ได้: auth · callback · status · products · fields" }, 404);
}

export const config = { path: "/api/lazada/*" };
