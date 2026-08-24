// เช็คสุขภาพระบบหลังบ้าน — /api/status  (ต้องมีรหัสหลังร้าน)
//
// ยิงไปถามของจริงทุกตัวแล้วรายงานว่าใช้ได้ไหม ไม่ได้เดาจากค่า env อย่างเดียว
// เจ้าของร้านเปิดหน้า /admin/status/ แล้วเห็นทันทีว่ามีอะไรพังอยู่หรือเปล่า
//
// ผลลัพธ์แต่ละแถว
//   ok      = ระบบปกติ
//   slow    = ใช้ได้แต่ช้าผิดปกติ
//   off     = ยังไม่ได้เปิดใช้ (ไม่ใช่ความผิดพลาด เช่นยังไม่ได้ใส่คีย์ LINE)
//   down    = พังจริง ต้องรีบดู
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const SLOW_MS = 2500;   // ช้ากว่านี้ถือว่าผิดปกติ

// ยิงเช็คทีละอย่าง จับเวลา และห้ามให้ตัวไหนพังแล้วลากทั้งหน้าไปด้วย
async function check(name, fn) {
  const t0 = Date.now();
  try {
    const r = await fn();
    const ms = Date.now() - t0;
    if (r?.off) return { name, state: "off", note: r.note ?? "ยังไม่ได้เปิดใช้", ms };
    // ⚠️ "ทำงานอยู่ แต่ควรมาดู" — ไม่ใช่ปกติ และไม่ใช่พัง
    //    เช่น ฟีดยังตอบได้แต่ใช้สต็อกเก่า หรือมีบอตถูกสั่งปิดไว้
    //    ถ้าไม่มีสถานะนี้ ของพวกนั้นจะขึ้นเขียวเหมือนทุกอย่างเรียบร้อย ซึ่งหลอกตา
    if (r?.warn) return { name, state: "warn", note: r.note ?? "ควรมาดู", ms };
    return { name, state: ms > SLOW_MS ? "slow" : "ok", note: r?.note ?? "", ms };
  } catch (e) {
    return {
      name,
      state: "down",
      note: String(e?.message ?? e).slice(0, 120),
      ms: Date.now() - t0,
    };
  }
}

const timeout = (ms) => AbortSignal.timeout(ms);

export default async function handler(req, context) {
  // adminGate คืน { wants, ok, deny } ไม่ใช่ Response — ต้องเช็คสองชั้น
  // (เผลอ return ตัว object ตรง ๆ ทีเดียว Netlify ตอบ 502 ทันที)
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  const env = process.env;
  const origin = new URL(req.url).origin;

  // ช่องทางที่ลูกค้าจ่ายเงินได้จริงตอนนี้ — คิดจาก env ทุกครั้ง ห้ามเขียนตายตัว
  // ใช้ร่วมกันทั้งข้อพร้อมเพย์และข้อ COD จะได้ไม่มีวันบอกไม่ตรงกัน
  const beamLive = () =>
    Boolean(env.BEAM_MERCHANT_ID && env.BEAM_API_KEY && env.BEAM_ENV !== "playground");
  const payWaysBesidesPromptPay = () => [
    ...(beamLive() ? ["บัตร/QR ผ่าน Beam"] : []),
    ...(env.NEXT_PUBLIC_COD === "1" ? ["เก็บเงินปลายทาง"] : []),
  ];
  const payWays = () => [
    ...(env.NEXT_PUBLIC_PROMPTPAY_ID ? ["QR พร้อมเพย์"] : []),
    ...payWaysBesidesPromptPay(),
  ];

  const checks = await Promise.all([
    // ---------- ที่เก็บข้อมูลของเราเอง ----------
    check("ที่เก็บข้อมูล (ออเดอร์/บัญชี/แชท)", async () => {
      const s = getStore({ name: "gucut-orders", consistency: "strong" });
      await s.set("healthcheck", String(Date.now()));
      const back = await s.get("healthcheck");
      if (!back) throw new Error("เขียนได้แต่อ่านไม่ได้");
      return {};
    }),

    // ---------- สต็อก/ราคาสดจาก ZORT ----------
    check("สต็อกและราคาจาก ZORT", async () => {
      const { ZORT_STORENAME: st, ZORT_APIKEY: k, ZORT_APISECRET: sec } = env;
      if (!st || !k || !sec) return { off: true, note: "ยังไม่ได้ใส่รหัส ZORT" };
      const r = await fetch("https://open-api.zortout.com/v4/Product/GetProducts?limit=1", {
        headers: { storename: st, apikey: k, apisecret: sec },
        signal: timeout(8000),
      });
      if (!r.ok) throw new Error(`ZORT ตอบ ${r.status}`);
      return {};
    }),

    // ---------- แจ้งเตือนเข้ากลุ่มร้าน ----------
    check("แจ้งเตือนเข้า Telegram", async () => {
      const { TELEGRAM_BOT_TOKEN: tok, TELEGRAM_CHAT_ID: chat } = env;
      if (!tok || !chat) return { off: true, note: "ยังไม่ได้ใส่ token" };
      const r = await fetch(`https://api.telegram.org/bot${tok}/getMe`, { signal: timeout(6000) });
      const j = await r.json().catch(() => null);
      if (!j?.ok) throw new Error("token ใช้ไม่ได้แล้ว");
      return { note: `บอท @${j.result?.username ?? "-"}` };
    }),

    // ---------- คลิปวิดีโอ ----------
    // ⚠️ ต้องเช็ค "ที่อยู่ที่ลูกค้าใช้จริง" เท่านั้น
    //    ของเดิมเช็คลิงก์ pub-xxx.r2.dev/v/... ซึ่งเป็นที่อยู่เก่าสองชั้น
    //    (ย้ายมา video.gucut.com แล้ว และเปลี่ยนจาก /v/ เป็น /v2/ ตอนหั่นคลิปใหม่)
    //    ไฟล์เก่ายังอยู่บน R2 เป็นทางถอยกลับ ตัวตรวจจึงขึ้นเขียวตลอด
    //    ต่อให้ video.gucut.com ล่มหรือกฎแคชที่ Cloudflare ถูกลบ ก็ไม่มีใครรู้
    check("คลิปวิดีโอ", async () => {
      const u = "https://video.gucut.com/v2/ba717cb6b4364b1ab9ea4fc599a1e70b/master.m3u8";
      const r = await fetch(u, { signal: timeout(8000) });
      if (!r.ok) throw new Error(`ที่เก็บคลิปตอบ ${r.status}`);
      const cache = r.headers.get("cf-cache-status");
      return { note: cache ? `แคชที่ Cloudflare: ${cache}` : "ต่อได้ แต่ไม่เห็นสถานะแคช" };
    }),

    // ---------- แจ้งเตือนเด้งมือถือแอดมิน ----------
    check("แจ้งเตือนเด้งมือถือ", async () => {
      const s = getStore({ name: "gucut-push", consistency: "strong" });
      const subs = (await s.get("push-subs", { type: "json" }).catch(() => null)) || [];
      if (!subs.length) return { off: true, note: "ยังไม่มีเครื่องไหนเปิดรับ" };
      return { note: `เปิดรับอยู่ ${subs.length} เครื่อง` };
    }),

    // ---------- รับเงิน ----------
    // ⚠️ ทุกข้อความตรงนี้ต้องคิดจาก "ช่องทางที่เปิดอยู่จริงทั้งหมด" ไม่ใช่ดูช่องเดียว
    //    เคยพลาดสองรอบแล้ว: รอบแรกเขียนตายตัวว่า "จ่ายได้แค่ปลายทาง" ทั้งที่ COD ปิดไปแล้ว
    //    รอบสองแก้ให้ดู COD ประกอบ แต่ลืม Beam ซึ่งเปิดรับเงินอยู่จริง
    //    ผลคือหน้าจอขึ้นสีแดงว่า "ลูกค้าจ่ายเงินไม่ได้เลย" ทั้งที่จ่ายได้ตามปกติ
    //    เตือนผิดอันตรายพอ ๆ กับไม่เตือน — คนอ่านจะเลิกเชื่อหน้านี้ทั้งหน้า
    check("รับเงินด้วย QR พร้อมเพย์", async () => {
      if (env.NEXT_PUBLIC_PROMPTPAY_ID) return {};
      const others = payWaysBesidesPromptPay();
      return others.length
        ? { off: true, note: `ยังไม่ได้ใส่เบอร์พร้อมเพย์ — ลูกค้าจ่ายทาง${others.join(" หรือ ")}ได้` }
        : { warn: true, note: "ยังไม่ได้ใส่เบอร์พร้อมเพย์ และไม่มีช่องทางอื่นเปิดอยู่ — ลูกค้าจ่ายเงินไม่ได้เลย" };
    }),

    // ---------- โค้ดส่วนลด ----------
    check("โค้ดส่วนลด", async () => {
      if (!env.COUPON_CODES) return { off: true, note: "ยังไม่ได้ตั้งโค้ดไว้" };
      const list = JSON.parse(env.COUPON_CODES);
      if (!Array.isArray(list)) throw new Error("รูปแบบ COUPON_CODES ไม่ถูกต้อง");
      return { note: `มี ${list.length} โค้ด` };
    }),

    // ---------- เข้าสู่ระบบด้วยโซเชียล ----------
    check("เข้าสู่ระบบด้วย LINE", async () =>
      env.LINE_CHANNEL_ID && env.LINE_CHANNEL_SECRET ? {} : { off: true }),
    check("เข้าสู่ระบบด้วย Facebook", async () =>
      env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET ? {} : { off: true }),
    check("เข้าสู่ระบบด้วย Google", async () =>
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? {} : { off: true }),

    // ---------- ฟีดสินค้าที่ผู้ช่วย AI อ่าน ----------
    // ⚠️ ห้ามโหลดฟีดทั้งก้อนมาตรวจ — ตัวไฟล์ 700KB+ ทำให้ขึ้น "ช้าผิดปกติ" ทุกครั้ง
    //    ทั้งที่ระบบปกติดี แล้วคนอ่านก็จะเลิกเชื่อหน้านี้ไปเลย
    //    เช็คสองอย่างที่พอ: ฟีดยังตอบไหม (HEAD) และสต็อกที่เก็บไว้สดแค่ไหน
    check("ฟีดสินค้าให้ AI (/products.json)", async () => {
      const r = await fetch(`${origin}/products.json`, { method: "HEAD", signal: timeout(10000) });
      if (!r.ok) throw new Error(`ฟีดตอบ ${r.status}`);

      const s = getStore({ name: "gucut-coupon", consistency: "eventual" });
      const cached = await s.get("zort-stock", { type: "json" }).catch(() => null);
      if (!cached?.at) return { warn: true, note: "ฟีดตอบได้ แต่ยังไม่เคยดึงสต็อกจากคลังสำเร็จ" };

      const mins = Math.round((Date.now() - cached.at) / 60000);
      const n = Object.keys(cached.map || {}).length;
      return mins > 90
        ? { warn: true, note: `สต็อกเก่า ${mins} นาที — ดึงจากคลังไม่สำเร็จมาสักพัก` }
        : { note: `${n.toLocaleString("en-US")} รหัสสินค้า · สต็อกอัปเดต ${mins} นาทีที่แล้ว` };
    }),

    // ---------- ไฟล์ที่ผู้ช่วย AI อ่าน ----------
    check("ไฟล์สำหรับผู้ช่วย AI", async () => {
      const want = ["/llms.txt", "/llms-full.txt", "/agents.md", "/robots.txt", "/feed-base.json"];
      const got = await Promise.all(
        want.map((u) =>
          fetch(`${origin}${u}`, { method: "HEAD", signal: timeout(6000) })
            .then((r) => (r.ok ? null : u))
            .catch(() => u),
        ),
      );
      const bad = got.filter(Boolean);
      if (bad.length) throw new Error(`เปิดไม่ได้: ${bad.join(" ")}`);
      return { note: `ครบทั้ง ${want.length} ไฟล์` };
    }),

    // ---------- แสกนภาพหาสินค้า ----------
    check("แสกนภาพหาสินค้า", async () => {
      const want = ["/img-vectors.bin", "/model/mobilenet/model.json", "/search-index.json"];
      const got = await Promise.all(
        want.map((u) =>
          fetch(`${origin}${u}`, { method: "HEAD", signal: timeout(6000) })
            .then((r) => (r.ok ? null : u))
            .catch(() => u),
        ),
      );
      const bad = got.filter(Boolean);
      if (bad.length) throw new Error(`ไฟล์หาย: ${bad.join(" ")}`);
      return {};
    }),

    // ---------- บอต AI เข้ามาจริงไหม ----------
    check("ตัวจับบอต AI", async () => {
      const s = getStore({ name: "gucut-live", consistency: "eventual" });
      const { blobs } = await s.list({ prefix: "p/" });
      if (!blobs.length) return { warn: true, note: "ยังไม่เคยจับบอตได้เลย — ตัวดักที่ขอบอาจไม่ทำงาน" };
      const days = new Set(blobs.map((b) => b.key.split("/")[1]).filter(Boolean));
      const latest = [...days].sort().pop();
      return { note: `จดไว้ ${blobs.length.toLocaleString("en-US")} รายการ · ล่าสุด ${latest}` };
    }),

    // ---------- ตัวคุมบอต ----------
    check("ตัวคุมบอต AI", async () => {
      const { readBlocked } = await import("../lib/botrules.mjs");
      const blocked = await readBlocked();
      return blocked.length
        ? { warn: true, note: `ปิดอยู่ ${blocked.length} เจ้า: ${blocked.join(", ")}` }
        : { note: "เปิดให้ทุกเจ้าเก็บข้อมูล" };
    }),

    // ---------- นับคนเข้าเว็บ ----------
    check("นับคนเข้าเว็บ", async () => {
      const s = getStore({ name: "gucut-live", consistency: "eventual" });
      const day = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      const { blobs } = await s.list({ prefix: `v/${day}/` });
      return { note: `วันนี้ ${blobs.length.toLocaleString("en-US")} คน` };
    }),

    // ---------- หัวใจ / คอมเมนต์ใต้คลิป ----------
    check("หัวใจและคอมเมนต์ใต้คลิป", async () => {
      const s = getStore({ name: "gucut-social", consistency: "eventual" });
      const counts = (await s.get("counts", { type: "json" }).catch(() => null)) || {};
      const n = Object.keys(counts).length;
      return n ? { note: `มีข้อมูล ${n} คลิป` } : { off: true, note: "ยังไม่มีใครกดอะไร" };
    }),

    // ---------- พิกเซลการตลาด ----------
    check("พิกเซลการตลาด", async () => {
      const s = getStore({ name: "gucut-coupon", consistency: "strong" });
      const m = (await s.get("marketing", { type: "json" }).catch(() => null)) || {};
      const on = Object.entries(m)
        .filter(([, v]) => v && typeof v === "object" && v.on)
        .map(([k]) => k);
      return on.length ? { note: `เปิดอยู่: ${on.join(", ")}` } : { off: true, note: "ยังไม่ได้เปิดเจ้าไหน" };
    }),

    // ---------- ยิงยอดขายจากเซิร์ฟเวอร์เข้า Meta (CAPI) ----------
    //
    // ⚠️ บทเรียน 20 ส.ค. 2569 — ตัวตรวจรอบแรกถามผิดคำถาม แล้วขึ้นแดงปลอม
    //    เคยเช็คด้วย GET /<pixel-id>?fields=name แล้วได้ (#100) Missing Permission
    //    ทั้งที่โทเคนไม่ได้เสีย — เพราะโทเคน CAPI มีสิทธิ์ "ส่งเหตุการณ์" อย่างเดียว
    //    ไม่มีสิทธิ์ "อ่านข้อมูลพิกเซล" ซึ่งเป็นคนละเรื่องกัน
    //    แดงปลอมอันตรายพอกับเขียวปลอม เพราะทำให้ไปไล่แก้ของที่ไม่ได้พัง
    //
    // ตอนนี้จึงตรวจสองชั้น ตามความจริงที่รู้ได้จริง
    //   1. โทเคนยังมีชีวิตไหม  → GET /me (ทุกโทเคนเรียกได้)
    //   2. เคยยิงเข้าจริงหรือยัง → หมุดที่ marketing.mjs จดไว้ตอนมีออเดอร์
    // ⚠️ ห้ามสรุปว่า "ใช้ได้" จากข้อ 1 อย่างเดียว — โทเคนมีชีวิตแต่ผูกผิดพิกเซลก็เป็นแบบนี้
    //    จะรู้แน่ก็ต่อเมื่อมีออเดอร์จริงผ่านเข้าไปแล้ว (กติกาเดียวกับ Beam)
    check("ยิงยอดขายเข้า Meta จากเซิร์ฟเวอร์", async () => {
      const s = getStore({ name: "gucut-coupon", consistency: "strong" });
      const m = (await s.get("marketing", { type: "json" }).catch(() => null)) || {};
      const meta = m.meta || {};
      if (!meta.on || !meta.pixelId) return { off: true, note: "ยังไม่ได้เปิดพิกเซล Meta" };
      if (!meta.token) {
        // ⚠️ ต้องเป็น warn ไม่ใช่ off — พิกเซลทำงานอยู่ แต่ยอดขายนับขาดเพราะยิงทางเดียว
        return { warn: true, note: "ยังไม่ได้ใส่ Conversions API Token — ยอดขายที่ Facebook เห็นจะนับขาด (ตัวบล็อกโฆษณา · iOS ตัดคุกกี้)" };
      }

      // 1. โทเคนยังใช้ได้อยู่ไหม
      const r = await fetch(
        `https://graph.facebook.com/v21.0/me?access_token=${encodeURIComponent(meta.token)}`,
        { signal: AbortSignal.timeout(8000) },
      );
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error?.message || `Facebook ตอบ ${r.status}`);

      const warnTest = meta.testCode
        ? " ⚠️ ยังใส่ Test Event Code อยู่ ยอดจะไม่เข้าของจริง"
        : "";

      // 2. เคยยิงเข้าจริงหรือยัง — หมุดถูกจดตอนมีออเดอร์ผ่านเข้าไป
      const last = await s.get("capi-last", { type: "json" }).catch(() => null);
      if (!last?.at) {
        return {
          warn: true,
          note: `โทเคนใช้ได้ แต่ยังไม่เคยยิงยอดขายจริงสักครั้ง — จะรู้แน่ว่าต่อถูกพิกเซลตอนมีออเดอร์ใบแรก${warnTest}`,
        };
      }
      const d = new Date(last.at).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
      if (!last.ok) {
        return { warn: true, note: `ยิงล่าสุด ${d} แล้ว Facebook ปฏิเสธ: ${String(last.error || "").slice(0, 90)}` };
      }
      return { note: `ใช้ได้จริง · ยิงสำเร็จล่าสุด ${d} (ออเดอร์ ${last.orderId})${warnTest}` };
    }),

    // ---------- ตัวเลขค่าโฆษณา Google ----------
    //
    // ⚠️ ต้องมีตัวเตือน เพราะสคริปต์อยู่ในบัญชี Google ไม่ได้อยู่ในมือเรา
    //    เจ้าของร้านลบทิ้ง Google หยุดรัน หรือสิทธิ์หมดอายุเมื่อไหร่ ก็เงียบไปเฉย ๆ
    //    แล้วหน้าโฆษณาจะโชว์ตัวเลขเก่าค้างโดยไม่มีอะไรบอกว่ามันหยุดไปแล้ว
    check("ตัวเลขค่าโฆษณา Google (สคริปต์)", async () => {
      const s = getStore({ name: "gucut-coupon", consistency: "strong" });
      const cfg = (await s.get("adstats", { type: "json" }).catch(() => null)) || {};
      const g = cfg.google || {};

      // ต่อ API ตรงได้แล้วก็ไม่ต้องพึ่งสคริปต์
      if (g.on && g.developerToken && g.refreshToken && g.customerId) {
        return { note: "ใช้การต่อ API ตรง ไม่ได้พึ่งสคริปต์" };
      }
      if (!g.pushedAt) return { off: true, note: "ยังไม่เคยมีสคริปต์ส่งข้อมูลเข้ามา" };

      const hours = Math.round((Date.now() - g.pushedAt) / 3600000);
      const d = new Date(g.pushedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
      // สคริปต์ตั้งให้รันวันละครั้ง เกินสองวัน = หยุดไปแล้วแน่ ๆ
      if (hours > 48) {
        return { warn: true, note: `ไม่มีข้อมูลเข้ามา ${hours} ชั่วโมงแล้ว (ล่าสุด ${d}) — สคริปต์ใน Google Ads อาจถูกปิดหรือหมดสิทธิ์` };
      }
      return { note: `ส่งเข้ามาล่าสุด ${d} · เก็บไว้ ${new Set((g.daily || []).map((r) => r.d)).size} วัน` };
    }),

    // ---------- รับเงินผ่าน Beam ----------
    check("รับเงินผ่าน Beam", async () => {
      const { BEAM_MERCHANT_ID: id, BEAM_API_KEY: key, BEAM_ENV: mode } = env;
      if (!id || !key) {
        return { off: true, note: `ยังไม่ได้ใส่รหัส (merchant ${id ? "มี" : "ไม่มี"} · key ${key ? "มี" : "ไม่มี"})` };
      }
      if (mode === "playground") return { warn: true, note: "อยู่ในโหมดสนามทดลอง — เงินไม่เข้าจริง" };

      // ⚠️ เตือนจนกว่าจะมีเงินเข้าจริงสักครั้ง
      //    ต่อ API สำเร็จกับ "เงินเข้าบัญชีจริง" เป็นคนละเรื่องกัน
      //    ยังไม่เคยมีใครจ่ายสำเร็จ = ยังไม่รู้ว่าปลายทางครบวงจรไหม
      //    (เจ้าของร้านฝากไว้ว่าจะทดสอบจ่ายจริงทีหลัง — ตัวนี้เตือนแทนความจำ)
      const s2 = getStore({ name: "gucut-orders", consistency: "strong" });
      const first = await s2.get("beam-first-paid", { type: "json" }).catch(() => null);
      if (!first?.at) {
        return { warn: true, note: "ต่อระบบแล้ว แต่ยังไม่เคยมีเงินเข้าจริงสักครั้ง — ควรทดสอบจ่ายจริง 1 ใบ" };
      }
      const d = new Date(first.at).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
      return { note: `ใช้งานจริง · มีเงินเข้าครั้งแรก ${d} (ออเดอร์ ${first.orderId})` };
    }),

    // ---------- เก็บเงินปลายทาง ----------
    check("เก็บเงินปลายทาง (COD)", async () => {
      if (env.NEXT_PUBLIC_COD === "1") return { note: "เปิดอยู่" };
      const others = payWays();
      return {
        off: true,
        note: others.length
          ? `ปิดอยู่ — ลูกค้าจ่ายทาง${others.join(" หรือ ")}`
          : "ปิดอยู่ และไม่มีช่องทางอื่นเปิดด้วย",
      };
    }),

    // ---------- ส่งออเดอร์ต่อไปที่อื่น ----------
    check("ส่งออเดอร์ต่อไป Make.com", async () =>
      env.ORDER_FORWARD_URL ? {} : { off: true, note: "ไม่ได้ใช้ (ไม่บังคับ)" }),
  ]);

  return json({ at: Date.now(), checks });
}

export const config = { path: "/api/status" };
