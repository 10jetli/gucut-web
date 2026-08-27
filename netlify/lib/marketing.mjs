// พิกเซลการตลาด — ตรรกะกลาง ใช้ร่วมกันระหว่าง /api/marketing กับ /api/orders
//
// เก็บค่าที่ store `gucut-coupon` คีย์ `marketing` (store เดียวกับโค้ดส่วนลด/แต้ม
// เพื่อไม่ให้ store งอกเป็นดงเล็ก ๆ เต็มไปหมด)
//
// ⚠️ แยกให้ชัดว่าอะไร "เปิดเผยได้" อะไร "ห้ามหลุด"
//   pixelId / measurementId  = ฝังอยู่ในหน้าเว็บอยู่แล้ว ใครก็เห็น → เปิดเผยได้
//   token (CAPI)             = ยิง event แทนร้านได้ → ห้ามส่งออกหน้าเว็บเด็ดขาด
// publicView() คือด่านกันไม่ให้ token หลุดไปกับ /api/marketing ที่หน้าร้านเรียก
import { getStore } from "@netlify/blobs";

const KEY = "marketing";
const store = () => getStore({ name: "gucut-coupon", consistency: "strong" });

export const DEFAULTS = {
  // Meta (Facebook + Instagram)
  meta: { on: false, pixelId: "", token: "", testCode: "" },
  // TikTok
  tiktok: { on: false, pixelId: "", token: "", testCode: "" },
  // Google Analytics 4
  ga4: { on: false, id: "" },
  // Google Ads — ใช้ยิง conversion ตอนสั่งซื้อสำเร็จ
  ads: { on: false, id: "", label: "" },
  // LINE Tag
  line: { on: false, tagId: "" },
  // Cloudflare Web Analytics — ไม่ใช้คุกกี้ ไม่ตามรอยรายบุคคล
  // token ตัวนี้ "ไม่ใช่ความลับ" มันฝังอยู่ในหน้าเว็บให้ทุกคนเห็นอยู่แล้ว
  cf: { on: false, token: "" },
};

const str = (v, max = 120) => String(v ?? "").trim().slice(0, max);

export async function readMarketing() {
  try {
    const s = await store().get(KEY, { type: "json" });
    if (!s) return structuredClone(DEFAULTS);
    // เติมช่องที่ยังไม่มีให้ครบ เผื่อเพิ่มช่องทางใหม่ทีหลัง ของเก่าจะไม่พัง
    const out = structuredClone(DEFAULTS);
    for (const k of Object.keys(out)) out[k] = { ...out[k], ...(s[k] || {}) };
    return out;
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export async function writeMarketing(next) {
  const cur = await readMarketing();
  const pick = (k, fields) => {
    const src = next?.[k] || {};
    const o = { on: src.on === true };
    for (const f of fields) {
      // ส่งค่าว่างมา = ไม่แตะของเดิม (หน้าเว็บส่ง token เป็น "" ตอนไม่ได้แก้)
      o[f] = src[f] === undefined || src[f] === "" ? cur[k][f] : str(src[f], f === "token" ? 400 : 120);
    }
    return o;
  };
  const merged = {
    meta: pick("meta", ["pixelId", "token", "testCode"]),
    tiktok: pick("tiktok", ["pixelId", "token", "testCode"]),
    ga4: pick("ga4", ["id"]),
    ads: pick("ads", ["id", "label"]),
    line: pick("line", ["tagId"]),
    cf: pick("cf", ["token"]),
  };
  await store().setJSON(KEY, merged);
  return merged;
}

/** ตัด token ออกก่อนส่งให้หน้าร้าน — เหลือแต่ค่าที่ฝังในหน้าเว็บอยู่แล้ว */
export function publicView(m) {
  const on = (x, id) => x.on && !!x[id];
  return {
    meta: { on: on(m.meta, "pixelId"), pixelId: m.meta.on ? m.meta.pixelId : "" },
    tiktok: { on: on(m.tiktok, "pixelId"), pixelId: m.tiktok.on ? m.tiktok.pixelId : "" },
    ga4: { on: on(m.ga4, "id"), id: m.ga4.on ? m.ga4.id : "" },
    ads: { on: on(m.ads, "id"), id: m.ads.on ? m.ads.id : "", label: m.ads.on ? m.ads.label : "" },
    line: { on: on(m.line, "tagId"), tagId: m.line.on ? m.line.tagId : "" },
    // token ของ Cloudflare ส่งออกหน้าเว็บได้ ไม่ใช่ความลับ (ต่างจาก token ของ CAPI)
    cf: { on: on(m.cf, "token"), token: m.cf.on ? m.cf.token : "" },
  };
}

/** มุมมองหลังร้าน — บอกว่ามี token แล้วหรือยัง แต่ไม่ส่งตัว token กลับไป */
export function adminView(m) {
  const mask = (t) => (t ? "•".repeat(12) : "");
  return {
    ...m,
    meta: { ...m.meta, token: mask(m.meta.token) },
    tiktok: { ...m.tiktok, token: mask(m.tiktok.token) },
  };
}

// ---------------------------------------------------------------------------
// ยิงยอดขายจากเซิร์ฟเวอร์ (Conversions API)
//
// ทำไมต้องมีทั้งที่ยิงจากเบราว์เซอร์อยู่แล้ว: พิกเซลฝั่งเบราว์เซอร์โดนสกัดเยอะมาก
// ตัวบล็อกโฆษณา · Safari/iOS ตัดคุกกี้ข้ามเว็บ · ลูกค้าปิดหน้าก่อนสคริปต์ทำงานจบ
// ยิงจากเซิร์ฟเวอร์ด้วยจึงได้ยอดครบกว่ามาก (นี่คือสิ่งที่แอป Omega ทำให้ตอนอยู่ Shopify)
//
// ⚠️ ต้องส่ง event id เดียวกับฝั่งเบราว์เซอร์ ("เลขออเดอร์") ไม่งั้นยอดถูกนับสองเท่า
//    Meta/TikTok จะจับคู่ id นี้แล้วรวมเป็นรายการเดียวให้เอง
//
// ⚠️ เบอร์โทร/อีเมลต้องแฮชด้วย SHA-256 ก่อนส่งเสมอ ห้ามส่งของจริง
//    และต้องทำให้เป็นรูปแบบมาตรฐานก่อนแฮช ไม่งั้นแฮชไม่ตรงกับที่ปลายทางมี
import { createHash } from "node:crypto";

const sha256 = (v) => createHash("sha256").update(String(v)).digest("hex");

/** เบอร์ไทยให้เป็นรูปแบบสากลก่อนแฮช: 081-234-5678 → 66812345678 */
function normPhoneE164(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("66")) return d;
  if (d.startsWith("0")) return "66" + d.slice(1);
  return d;
}

const hashed = (v) => (v ? [sha256(v)] : undefined);

async function postJson(url, body, headers = {}) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await r.text().catch(() => "");
  return { ok: r.ok, status: r.status, body: text.slice(0, 300) };
}

/**
 * ยิง Purchase ไปทุกเจ้าที่ตั้ง token ไว้
 * @param order  ออเดอร์ที่เพิ่งบันทึก (ต้องมี id, items, total, customer)
 * @param meta   { ip, userAgent, sourceUrl }
 * @returns สรุปผลรายเจ้า ไว้เก็บลงออเดอร์เพื่อตรวจย้อนหลังได้
 */
export async function sendPurchase(order, meta = {}) {
  const cfg = await readMarketing();
  const out = {};
  const now = Math.floor(Date.now() / 1000);
  const phone = normPhoneE164(order?.customer?.phone);
  const email = String(order?.customer?.email || "").trim().toLowerCase();
  const value = Number(order?.total) || 0;
  const items = Array.isArray(order?.items) ? order.items : [];

  if (cfg.meta.on && cfg.meta.pixelId && cfg.meta.token) {
    try {
      const body = {
        data: [{
          event_name: "Purchase",
          event_time: now,
          event_id: String(order.id),        // ต้องตรงกับฝั่งเบราว์เซอร์
          action_source: "website",
          event_source_url: meta.sourceUrl,
          user_data: {
            ph: hashed(phone),
            em: hashed(email),
            client_ip_address: meta.ip,
            client_user_agent: meta.userAgent,
          },
          custom_data: {
            currency: "THB",
            value,
            contents: items.map((i) => ({ id: i.sku || i.title, quantity: i.qty, item_price: i.price })),
            num_items: items.reduce((s, i) => s + (i.qty || 1), 0),
          },
        }],
        ...(cfg.meta.testCode ? { test_event_code: cfg.meta.testCode } : {}),
      };
      out.meta = await postJson(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(cfg.meta.pixelId)}/events?access_token=${encodeURIComponent(cfg.meta.token)}`,
        body,
      );
    } catch (e) {
      out.meta = { ok: false, body: String(e?.message || e).slice(0, 200) };
    }
    // จดผลครั้งล่าสุดไว้ให้หน้าสถานะระบบอ่าน
    //
    // ⚠️ นี่เป็นหลักฐานเดียวที่บอกได้ว่า "ต่อถูกพิกเซลจริง"
    //    เช็คว่าโทเคนยังมีชีวิตอยู่ไม่พอ — โทเคนดีแต่ผูกผิดพิกเซลก็ผ่านด่านนั้นได้
    // ⚠️ ต้อง await — sendPurchase ทั้งก้อนวิ่งอยู่ใน later()/waitUntil อยู่แล้ว
    //    ไม่ถ่วงลูกค้า แต่ถ้าปล่อยลอย Netlify ฆ่าทิ้ง = หน้าสถานะไม่เคยเห็นผลจริง
    //    (เดิมเขียน void — ตัวตรวจ check-floating จับได้ 28 ส.ค. 2569)
    //    พังห้ามลามไปล้มการยิงจริง จึงครอบ catch ไว้
    await recordCapi({
      at: Date.now(),
      ok: !!out.meta?.ok,
      orderId: String(order?.id ?? ""),
      error: out.meta?.ok ? "" : String(out.meta?.body ?? "").slice(0, 200),
    }).catch(() => {});
  }

  if (cfg.tiktok.on && cfg.tiktok.pixelId && cfg.tiktok.token) {
    try {
      const body = {
        event_source: "web",
        event_source_id: cfg.tiktok.pixelId,
        ...(cfg.tiktok.testCode ? { test_event_code: cfg.tiktok.testCode } : {}),
        data: [{
          event: "CompletePayment",
          event_time: now,
          event_id: String(order.id),
          user: {
            phone: phone ? sha256(phone) : undefined,
            email: email ? sha256(email) : undefined,
            ip: meta.ip,
            user_agent: meta.userAgent,
          },
          page: meta.sourceUrl ? { url: meta.sourceUrl } : undefined,
          properties: {
            currency: "THB",
            value,
            contents: items.map((i) => ({
              content_id: i.sku || i.title,
              content_name: i.title,
              quantity: i.qty,
              price: i.price,
            })),
            content_type: "product",
          },
        }],
      };
      out.tiktok = await postJson(
        "https://business-api.tiktok.com/open_api/v1.3/event/track/",
        body,
        { "Access-Token": cfg.tiktok.token },
      );
    } catch (e) {
      out.tiktok = { ok: false, body: String(e?.message || e).slice(0, 200) };
    }
  }

  return out;
}


/**
 * จดผลการยิง CAPI ครั้งล่าสุด ให้หน้าสถานะระบบเอาไปโชว์
 * ⚠️ พังเงียบ ๆ ได้ ห้ามโยน error ออกไป — ถ้าจดไม่ได้ก็แค่ไม่มีข้อมูลโชว์
 *    ไม่ควรทำให้ออเดอร์ที่ลูกค้าจ่ายเงินมาแล้วล้มเพราะบันทึกช่วยจำ
 */
async function recordCapi(entry) {
  try {
    const { getStore } = await import("@netlify/blobs");
    await getStore({ name: "gucut-coupon", consistency: "strong" }).setJSON("capi-last", entry);
  } catch {
    /* ไม่เป็นไร */
  }
}
