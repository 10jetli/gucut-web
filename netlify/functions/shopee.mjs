// ท่อคุยกับ Shopee Open API — /api/shopee/*
//
//   GET /api/shopee/auth      (ต้องมี x-admin-key) → ลิงก์ให้เจ้าของร้านกดอนุญาต
//   GET /api/shopee/callback  ← Shopee ส่งกลับมาที่นี่หลังร้านกดอนุญาต (เปิดโล่ง ต้องเปิดได้)
//   GET /api/shopee/status    (ต้องมี x-admin-key) → เชื่อมร้านแล้วหรือยัง token เหลืออายุเท่าไหร่
//   GET /api/shopee/comments  (ต้องมี x-admin-key) → ลองดึงรีวิวจริงมาดู (ใช้ทดสอบ)
//   GET /api/shopee/buyer     (ต้องมี x-admin-key) → ชื่อ/เบอร์ผู้ซื้อของออเดอร์ใบเดียว (?sn=)
//
// ⚠️ /callback ต้องเปิดโล่ง เพราะคนเรียกคือเซิร์ฟเวอร์ Shopee ไม่ใช่เบราว์เซอร์ของร้าน
//    จึงแนบรหัสหลังร้านไปด้วยไม่ได้ — ปลอดภัยเพราะ code ใช้ได้ครั้งเดียวและต้องคู่กับ partner_key
// ⚠️ adminGate คืน { wants, ok, deny } ไม่ใช่ Response — เขียน `if (gate) return gate` ไม่ได้
//    (บทเรียน 25 ส.ค. 2569: Netlify ตอบ "Function returned an unsupported value" ทุกคำขอ)
import { adminGate } from "../lib/admin-gate.mjs";
import { shopeeReady, isTest, authLink, exchangeCode, loadToken, validToken, shopCall } from "../lib/shopee.mjs";
import { pullShopeeReviews } from "../lib/shopee-reviews.mjs";

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

  // ── สั่งดึงรีวิวผ่าน API เข้าคิวเดี๋ยวนั้น (ตัวจริงวิ่งเองทุกคืน 00:20 ไทย) ──
  /* นับสินค้าแยกตามสถานะบน Shopee — ไว้ตอบคำถาม "ลงขายอยู่กี่รายการกันแน่"
     ⚠️ ZORT โชว์ "จำนวนสินค้าที่เชื่อมต่อ" ซึ่ง**ไม่เท่ากับ**จำนวนที่ลงขายอยู่จริง
        ของที่ถอดออกจากหน้าร้านแล้วยังนับเป็น "เชื่อมต่อ" อยู่ ⇒ สองเลขนี้ห้ามเอามาเทียบกันตรง ๆ */
  if (step === "counts") {
    const t = await validToken();
    if (!t) return json({ error: "ยังไม่ได้เชื่อมร้าน Shopee" }, 400);
    const out = {};
    for (const st of ["NORMAL", "UNLIST", "BANNED", "REVIEWING"]) {
      let n = 0;
      let offset = 0;
      try {
        for (let p = 0; p < 40; p++) {
          const d = await shopCall("/api/v2/product/get_item_list", {
            offset: String(offset),
            page_size: "100",
            item_status: st,
          });
          n += (d?.response?.item ?? []).length;
          if (!d?.response?.has_next_page) break;
          offset += 100;
        }
        out[st] = n;
      } catch (e) {
        out[st] = `ผิดพลาด: ${String(e?.message || e).slice(0, 80)}`;
      }
    }
    /* นับต่อว่าในสินค้าที่ลงขายอยู่ มีการกรอกรหัส (SKU) ไว้กี่ตัว
       ⚠️ ตอบคำถามที่ค้างอยู่: "ได้ 15 รหัสจาก 37 สินค้า" เป็นบั๊กหรือเป็นความจริง
          ถ้าร้านไม่ได้กรอก SKU ไว้บน Shopee เลขน้อยก็ถูกแล้ว ไม่ใช่ของหาย */
    let items = 0, models = 0, withSku = 0, blank = 0, errs = 0;
    const uniq = new Set();
    try {
      let offset = 0;
      const ids = [];
      for (let p = 0; p < 40; p++) {
        const d = await shopCall("/api/v2/product/get_item_list", {
          offset: String(offset), page_size: "100", item_status: "NORMAL",
        });
        for (const it of d?.response?.item ?? []) ids.push(it.item_id);
        if (!d?.response?.has_next_page) break;
        offset += 100;
      }
      items = ids.length;
      for (let i = 0; i < ids.length; i += 8) {
        const got = await Promise.all(ids.slice(i, i + 8).map(async (id) => {
          try { return await shopCall("/api/v2/product/get_model_list", { item_id: String(id) }); }
          catch { errs += 1; return null; }
        }));
        for (const d of got) {
          for (const m of d?.response?.model ?? []) {
            models += 1;
            const k = String(m.model_sku || "").trim();
            if (k) { withSku += 1; uniq.add(k); } else blank += 1;
          }
        }
      }
    } catch (e) {
      errs += 1;
    }
    return json({
      ok: true,
      itemsByStatus: out,
      listedItems: items,
      models,
      modelsWithSku: withSku,
      modelsBlankSku: blank,
      uniqueSkus: uniq.size,
      failedCalls: errs,
    });
  }

  if (step === "pull") {
    try {
      const result = await pullShopeeReviews(url.origin);
      return json(result);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502);
    }
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

  // ── ชื่อ/เบอร์ผู้ซื้อของออเดอร์หนึ่งใบ ──
  //
  // มีไว้ให้หน้า "ใบคืนของ" ที่ admin.gucut.com เปิดดูตัวจริงได้
  // เพราะข้อมูลที่วิ่งมาทาง ZORT ถูก Shopee เซ็นเซอร์มาแล้ว (ลูกค้า u***** · โทร ******13)
  //
  // ⚠️ ห้าม log ห้ามส่งเข้า Telegram ห้ามเก็บลง Blobs — ส่งกลับให้คนกดดูเท่านั้น
  //    (กติกาเดียวกับข้อมูลบัตรประชาชนที่ /api/read-id)
  // ⚠️ ต้องกดดูทีละใบ ไม่ดึงล่วงหน้าทั้งหน้า — เปลืองโควตา Shopee และไม่มีเหตุให้ดูทุกใบ
  if (step === "buyer") {
    const sn = (url.searchParams.get("sn") || "").trim();
    if (!sn) return json({ error: "ต้องบอกเลขออเดอร์ Shopee มาด้วย (?sn=)" }, 400);
    try {
      const t = await validToken();
      if (!t) return json({ error: "ยังไม่ได้เชื่อมร้าน — เปิด /api/shopee/auth ก่อน" }, 400);
      const data = await shopCall("/api/v2/order/get_order_detail", {
        order_sn_list: sn,
        // ⚠️ ไม่ขอ 2 ช่องนี้ = Shopee ไม่ส่งมาให้เลย (ไม่ใช่ค่าว่าง แต่ไม่มีช่องนั้นในคำตอบ)
        response_optional_fields: "buyer_username,recipient_address",
      });
      const o = data?.response?.order_list?.[0];
      if (!o) return json({ error: `Shopee ไม่รู้จักออเดอร์ ${sn}`, mode: isTest() ? "test" : "live" }, 404);
      const r = o.recipient_address || {};
      return json({
        sn,
        mode: isTest() ? "test" : "live",
        buyer: o.buyer_username || "",
        name: r.name || "",
        phone: r.phone || "",
        address: [r.full_address, r.district, r.city, r.state, r.zipcode].filter(Boolean).join(" "),
      });
    } catch (e) {
      return json({ error: String(e.message || e), mode: isTest() ? "test" : "live" }, 502);
    }
  }

  return json({ error: "ไม่รู้จักคำสั่งนี้ — ใช้ได้: auth · callback · status · comments · buyer" }, 404);
}

export const config = { path: "/api/shopee/*" };
