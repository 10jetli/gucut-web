// ท่อคุยกับ TikTok Shop Open API — /api/tiktok/*
//
//   GET /api/tiktok/auth      (ต้องมี x-admin-key) → ลิงก์ให้เจ้าของร้านกดอนุญาต
//   GET /api/tiktok/callback  ← TikTok ส่งกลับมาที่นี่หลังร้านกดอนุญาต (เปิดโล่ง ต้องเปิดได้)
//   GET /api/tiktok/status    (ต้องมี x-admin-key) → เชื่อมร้านแล้วหรือยัง
//   GET /api/tiktok/reviews   (ต้องมี x-admin-key) → ลองดึงรีวิวจริงมาดู
//
// ⚠️ /callback ต้องเปิดโล่ง คนเรียกคือเซิร์ฟเวอร์ TikTok ไม่ใช่เบราว์เซอร์ของร้าน
//    ปลอดภัยเพราะ auth_code ใช้ได้ครั้งเดียวและต้องคู่กับ app_secret
// ⚠️ adminGate คืน { wants, ok, deny } ไม่ใช่ Response — ต้องเช็ค gate.ok เองเสมอ
import { adminGate } from "../lib/admin-gate.mjs";
import { tiktokReady, authLink, exchangeCode, loadToken, ensureShop, shopCall, VERSION } from "../lib/tiktok.mjs";

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

  if (!tiktokReady()) return json({ error: "ยังไม่ได้ตั้ง TIKTOK_APP_KEY / TIKTOK_APP_SECRET" }, 503);

  if (step === "callback") {
    const code = url.searchParams.get("code") || url.searchParams.get("auth_code");
    if (!code) return page("เชื่อมร้านไม่สำเร็จ", `<h2>เชื่อมร้านไม่สำเร็จ</h2><p>TikTok ไม่ได้ส่งรหัสยืนยันมา ลองกดอนุญาตใหม่</p>`);
    try {
      await exchangeCode(code);
      const t = await ensureShop();
      return page(
        "เชื่อมร้าน TikTok สำเร็จ",
        `<h2>✅ เชื่อมร้าน TikTok Shop สำเร็จแล้ว</h2>
         <p>ร้าน <b>${t?.shopName || "-"}</b></p>
         <p>ปิดหน้านี้ได้เลย ระบบต่ออายุการเชื่อมต่อให้เองอัตโนมัติ</p>`,
      );
    } catch (e) {
      return page("เชื่อมร้านไม่สำเร็จ", `<h2>เชื่อมร้านไม่สำเร็จ</h2><p>${String(e.message || e)}</p>`);
    }
  }

  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (step === "auth") return json({ link: authLink() });

  if (step === "status") {
    const t = await loadToken();
    if (!t) return json({ connected: false });
    return json({
      connected: true,
      shopName: t.shopName ?? null,
      hasShopCipher: !!t.shopCipher,
      tokenLeftMinutes: Math.round((t.expireAt - Math.floor(Date.now() / 1000)) / 60),
      savedAt: t.savedAt ?? null,
    });
  }

  /* ⚠️ **ยังใช้ไม่ได้จริง — อย่าเพิ่งเชื่อชื่อเส้นนี้** (พิสูจน์ 6 ก.ย. 2569 หลังเชื่อมร้านสำเร็จ)
      เส้น `/customer_service/{v}/reviews` ถูกเขียนไว้ตอน**ยังไม่มี token** จึงไม่เคยถูกยิงจริงสักครั้ง
      พอยิงของจริงครั้งแรกได้ `36009009 Invalid path` ⇒ เส้นนี้ไม่มีอยู่ในสารบบ
      และขอบเขต `seller.customer_service` เป็นหมวด "ข้อมูลละเอียดอ่อน" ที่เรา**ตั้งใจไม่เปิด**
      ⇒ ปล่อยไว้เพื่อบอกความจริง ไม่ใช่เพื่อใช้งาน · จะเปิดใช้ต้องหาเส้นจริงจากเอกสารก่อน
      (คลาสเดียวกับ "ตัวตรวจที่เขียวได้ทั้งที่ของจริงพัง" — ของที่ไม่เคยถูกยิงจริงยังไม่นับว่าทำงาน)
      รีวิว TikTok ตอนนี้เข้าเว็บทางตัวเก็บกลางคืน (/api/reviews-ingest) ซึ่งใช้ได้อยู่แล้ว */
  if (step === "reviews") {
    try {
      const t = await ensureShop();
      if (!t) return json({ error: "ยังไม่ได้เชื่อมร้าน — เปิด /api/tiktok/auth ก่อน" }, 400);
      const size = Math.min(Number(url.searchParams.get("size") || 20), 100);
      const data = await shopCall(`/customer_service/${VERSION}/reviews`, {
        query: { page_size: String(size) },
      });
      const list = data?.data?.reviews ?? [];
      return json({
        got: list.length,
        withImages: list.filter((r) => (r.images || []).length).length,
        withVideo: list.filter((r) => (r.videos || []).length).length,
        sample: list.slice(0, 3).map((r) => ({
          rating: r.rating,
          text: String(r.review_text || "").slice(0, 40),
          images: (r.images || []).length,
          video: (r.videos || []).length,
        })),
      });
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
  }

  return json({ error: "ไม่รู้จักคำสั่งนี้ — ใช้ได้: auth · callback · status · reviews" }, 404);
}

export const config = { path: "/api/tiktok/*" };
