// ท่อคุยกับ Shopee Open API — /api/shopee/*
//
//   GET /api/shopee/auth      (ต้องมี x-admin-key) → ลิงก์ให้เจ้าของร้านกดอนุญาต
//   GET /api/shopee/callback  ← Shopee ส่งกลับมาที่นี่หลังร้านกดอนุญาต (เปิดโล่ง ต้องเปิดได้)
//   GET /api/shopee/status    (ต้องมี x-admin-key) → เชื่อมร้านแล้วหรือยัง token เหลืออายุเท่าไหร่
//   GET /api/shopee/comments  (ต้องมี x-admin-key) → ลองดึงรีวิวจริงมาดู (ใช้ทดสอบ)
//
// ⚠️ /callback ต้องเปิดโล่ง เพราะคนเรียกคือเซิร์ฟเวอร์ Shopee ไม่ใช่เบราว์เซอร์ของร้าน
//    จึงแนบรหัสหลังร้านไปด้วยไม่ได้ — ปลอดภัยเพราะ code ใช้ได้ครั้งเดียวและต้องคู่กับ partner_key
// ⚠️ adminGate คืน { wants, ok, deny } ไม่ใช่ Response — เขียน `if (gate) return gate` ไม่ได้
//    (บทเรียน 25 ส.ค. 2569: Netlify ตอบ "Function returned an unsupported value" ทุกคำขอ)
import { adminGate } from "../lib/admin-gate.mjs";
import { shopeeReady, isTest, authLink, exchangeCode, loadToken, validToken, shopCall } from "../lib/shopee.mjs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

const page = (title, body) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${title}</title>` +
      `<div style="font-family:system-ui;max-width:34rem;margin:3rem auto;padding:0 1.5rem;line-height:1.7">${body}</div>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );

export default async function handler(req, context) {
  const url = new URL(req.url);
  const step = url.pathname.split("/").filter(Boolean).pop();

  if (!shopeeReady()) return json({ error: "ยังไม่ได้ตั้ง SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY" }, 503);

  // ── ปลายทางที่ Shopee ส่งกลับมาหลังร้านกดอนุญาต ──
  if (step === "callback") {
    const code = url.searchParams.get("code");
    const shopId = url.searchParams.get("shop_id");
    if (!code || !shopId) {
      return page("เชื่อมร้านไม่สำเร็จ", `<h2>เชื่อมร้านไม่สำเร็จ</h2><p>Shopee ไม่ได้ส่งรหัสยืนยันมา ลองกดอนุญาตใหม่อีกครั้ง</p>`);
    }
    try {
      const t = await exchangeCode(code, shopId);
      return page(
        "เชื่อมร้าน Shopee สำเร็จ",
        `<h2>✅ เชื่อมร้าน Shopee สำเร็จแล้ว</h2>
         <p>รหัสร้าน <b>${t.shopId}</b> · โหมด <b>${isTest() ? "ทดสอบ" : "ใช้งานจริง"}</b></p>
         <p>ปิดหน้านี้ได้เลย ระบบต่ออายุการเชื่อมต่อให้เองอัตโนมัติ</p>`,
      );
    } catch (e) {
      return page("เชื่อมร้านไม่สำเร็จ", `<h2>เชื่อมร้านไม่สำเร็จ</h2><p>${String(e.message || e)}</p>`);
    }
  }

  // ── ที่เหลือเป็นของหลังร้าน ต้องมีรหัส ──
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (step === "auth") {
    const redirect = `${url.origin}/api/shopee/callback`;
    return json({ mode: isTest() ? "test" : "live", redirect, link: authLink(redirect) });
  }

  if (step === "status") {
    const t = await loadToken();
    if (!t) return json({ connected: false, mode: isTest() ? "test" : "live" });
    const left = Math.round((t.expireAt - Math.floor(Date.now() / 1000)) / 60);
    return json({
      connected: true,
      mode: isTest() ? "test" : "live",
      shopId: t.shopId,
      tokenLeftMinutes: left,
      savedAt: t.savedAt ?? null,
    });
  }

  if (step === "comments") {
    try {
      const t = await validToken();
      if (!t) return json({ error: "ยังไม่ได้เชื่อมร้าน — เปิด /api/shopee/auth ก่อน" }, 400);
      const size = Math.min(Number(url.searchParams.get("size") || 20), 100);
      const data = await shopCall("/api/v2/product/get_comment", {
        page_size: String(size),
        ...(url.searchParams.get("cursor") ? { cursor: url.searchParams.get("cursor") } : {}),
      });
      const list = data?.response?.item_comment_list ?? data?.response?.comment_list ?? [];
      return json({
        got: list.length,
        withImages: list.filter((c) => (c.media?.image_url_list || []).length).length,
        withVideo: list.filter((c) => (c.media?.video_url_list || []).length).length,
        next: data?.response?.next_cursor ?? null,
        sample: list.slice(0, 3).map((c) => ({
          rating: c.rating_star,
          author: c.buyer_username,
          text: String(c.comment || "").slice(0, 40),
          images: (c.media?.image_url_list || []).length,
          video: (c.media?.video_url_list || []).length,
        })),
      });
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
  }

  return json({ error: "ไม่รู้จักคำสั่งนี้ — ใช้ได้: auth · callback · status · comments" }, 404);
}

export const config = { path: "/api/shopee/*" };
