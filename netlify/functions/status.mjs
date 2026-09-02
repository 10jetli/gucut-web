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

    // ---------- แจ้งเตือนลูกค้าทาง LINE ----------
    // ⚠️ ตัวนี้ต้องยิงของจริง ไม่ใช่แค่ดูว่ามี token ไหม
    //    token ที่หมดอายุหรือผูกผิด channel จะดูเหมือนตั้งค่าครบทุกอย่าง
    //    แล้วระบบตามเตือนจะเงียบไปเฉย ๆ โดยไม่มีใครรู้ว่าลูกค้าไม่เคยได้รับอะไรเลย
    check("แจ้งเตือนลูกค้าทาง LINE", async () => {
      if (!env.LINE_MESSAGING_TOKEN) {
        return {
          off: true,
          note: "ยังไม่ได้ตั้ง LINE_MESSAGING_TOKEN — ตามเตือนทาง Web Push และ Telegram แทน",
        };
      }
      const r = await fetch("https://api.line.me/v2/bot/info", {
        headers: { authorization: `Bearer ${env.LINE_MESSAGING_TOKEN}` },
        signal: AbortSignal.timeout(8000),
      });
      // ⚠️ token ใช้ไม่ได้ = "พัง" ไม่ใช่ "ยังไม่ได้เปิดใช้"
      //    ต้องโยน error เท่านั้น check() รู้จักแค่ off / warn / โยน error
      //    คืน { bad: true } จะกลายเป็นเขียวทั้งที่ใช้งานไม่ได้จริง
      if (r.status === 401) throw new Error("LINE ปฏิเสธ token — หมดอายุหรือคัดลอกมาไม่ครบ");
      if (!r.ok) throw new Error(`LINE ตอบ ${r.status}`);
      const info = await r.json().catch(() => null);
      return { note: `ต่อกับ OA ได้: ${info?.displayName || info?.basicId || "ไม่ทราบชื่อ"}` };
    }),

    // ---------- รับเงิน ----------
    // ช่องตรวจ "QR พร้อมเพย์แบบโอนเอง (แนบสลิป)" ถูกตัดออกตามคำสั่งเจ้าของร้าน
    // 28 ส.ค. 2569 — "ตัดออกเลยไม่ได้ใช้ ขี้เกียจตรวจสลิปเอง"
    // Beam ครอบคลุมการรับเงินทั้งหมดแล้ว (มีช่องตรวจของตัวเองด้านล่าง)
    // โค้ดฝั่งเช็คเอาต์ยังหลับอยู่เฉย ๆ (ไม่ตั้ง NEXT_PUBLIC_PROMPTPAY_ID ลูกค้าไม่เห็น)
    // — ไม่รื้อ เผื่อวันหน้าอยากเปิดกลับ · payWaysBesidesPromptPay ยังใช้กับช่อง COD อยู่

    // ---------- โค้ดส่วนลด ----------
    // ⚠️ แหล่งจริงของโค้ดคือ Blobs (ร้านสร้างจาก /admin/coupons/) — env เป็นแค่ของเก่า
    //    เดิมตัวตรวจดูแค่ env เลยขึ้น "ยังไม่เปิดใช้" ตลอดกาลแม้ร้านตั้งโค้ดแล้ว
    //    (เจ้าของร้านเจอเอง 28 ส.ค. 2569) — ตัวตรวจต้องดูที่เดียวกับที่ลูกค้าใช้จริง
    check("โค้ดส่วนลด", async () => {
      const { allCoupons, couponStore } = await import("../lib/coupons.mjs");
      const list = await allCoupons(couponStore());
      if (!list.length) return { off: true, note: "ยังไม่มีโค้ด — สร้างได้ที่หลังร้าน → โค้ดส่วนลด" };
      const now = Date.now();
      const live = list.filter((c) => !c.until || Date.parse(c.until) >= now);
      if (!live.length) return { warn: true, note: `มี ${list.length} โค้ดแต่หมดอายุทั้งหมด` };
      return { note: `ใช้ได้ ${live.length} โค้ด` };
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
      // ⚠️ ห้ามให้ HEAD ที่ timeout กลายเป็น "ใช้ไม่ได้" (แดง) — เจอของจริง 31 ส.ค. 2569
      //    /products.json เป็นฟังก์ชัน ไม่ใช่ไฟล์นิ่ง · คำขอแรกหลังแคชหมดอายุ (ทุก 30 นาที)
      //    ต้องรอกวาดสต็อกจาก ZORT สด ซึ่งวันที่ ZORT ช้าจะเกิน 10 วิได้ง่าย ๆ
      //    หน้านี้เลยขึ้นแดงทั้งที่ยิงเองตรง ๆ ได้ 200 ใน 0.13 วิ — ตัวตรวจที่ฟ้องผิด
      //    อันตรายพอกับตัวตรวจที่เขียวทั้งที่ของพัง เพราะคนอ่านจะเลิกเชื่อหน้านี้
      let feedNote = "";
      try {
        const r = await fetch(`${origin}/products.json`, { method: "HEAD", signal: timeout(20000) });
        if (!r.ok) throw new Error(`ฟีดตอบ ${r.status}`);
      } catch (e) {
        const aborted = /abort|timeout/i.test(String(e?.message || e));
        if (!aborted) throw e;
        feedNote = " · รอบนี้ฟีดตอบช้า (กำลังกวาดสต็อกใหม่จากคลัง)";
      }

      const s = getStore({ name: "gucut-coupon", consistency: "eventual" });
      const cached = await s.get("zort-stock", { type: "json" }).catch(() => null);
      if (!cached?.at) return { warn: true, note: "ฟีดตอบได้ แต่ยังไม่เคยดึงสต็อกจากคลังสำเร็จ" };

      const mins = Math.round((Date.now() - cached.at) / 60000);
      const n = Object.keys(cached.map || {}).length;
      const base = `${n.toLocaleString("en-US")} รหัสสินค้า · สต็อกอัปเดต ${mins} นาทีที่แล้ว${feedNote}`;
      if (mins > 90) return { warn: true, note: `สต็อกเก่า ${mins} นาที — ดึงจากคลังไม่สำเร็จมาสักพัก` };
      return feedNote ? { warn: true, note: base } : { note: base };
    }),

    // ---------- รับรีวิวใหม่จากมาร์เก็ตเพลส ----------
    // เจ้าของร้านสั่ง 31 ส.ค. 2569 "ดึงรีวิวใหม่ ๆ แต่ไม่ซ้ำ จาก lazada tiktok shopee ทุกคืน"
    // ⚠️ ต้องแยก "ท่อพร้อมรับ" ออกจาก "มีรีวิวไหลเข้าจริง" ให้ขาด
    //    ตั้ง secret แล้วขึ้นเขียวเฉย ๆ = หลอกตา เพราะงานเก็บรีวิวอาจไม่เคยยิงเข้ามาเลย
    check("รับรีวิวใหม่จากมาร์เก็ตเพลส", async () => {
      if (!env.REVIEWS_INGEST_SECRET) {
        return { off: true, note: "ยังไม่ได้ตั้ง REVIEWS_INGEST_SECRET — ท่อยังปิดอยู่" };
      }
      const s = getStore({ name: "gucut-reviews", consistency: "eventual" });
      const [meta, call] = await Promise.all([
        s.get("meta", { type: "json" }).catch(() => null),
        s.get("lastcall", { type: "json" }).catch(() => null),
      ]);
      const { blobs } = await s.list({ prefix: "r/" }).catch(() => ({ blobs: [] }));
      const waiting = blobs.length ? ` · รอเข้าเว็บรอบ build ถัดไป ${blobs.length} รีวิว` : "";
      const ago = (t) => {
        const h = Math.round((Date.now() - new Date(t).getTime()) / 3600000);
        return h < 1 ? "ไม่ถึงชั่วโมงที่แล้ว" : h > 48 ? `${Math.round(h / 24)} วันที่แล้ว` : `${h} ชม.ที่แล้ว`;
      };

      // ⚠️ "ไม่มีใครยิงเข้ามา" กับ "ยิงเข้ามาแล้วแต่ไม่มีรีวิวใหม่" ต้องแยกให้ขาด
      //    ถ้าดูแค่ meta (เวลาที่มีรีวิวเข้าจริง) สองอย่างนี้หน้าตาเหมือนกันหมด
      //    แล้วตัวเก็บที่พังจะดูเหมือน "คืนนี้ไม่มีรีวิวใหม่" ตลอดกาล
      if (!call?.at) {
        return { warn: true, note: "ท่อเปิดแล้ว แต่ยังไม่เคยมีใครยิงเข้ามาเลย — งานเก็บรีวิวยังไม่ได้ตั้ง" };
      }
      const callHrs = (Date.now() - new Date(call.at).getTime()) / 3600000;
      if (callHrs > 48) {
        return {
          warn: true,
          note: `งานเก็บรีวิวไม่ได้ยิงเข้ามา ${ago(call.at)} — ควรเช็คว่ายังวิ่งอยู่ไหม${waiting}`,
        };
      }
      // ยิงมาปกติ แต่ยังไม่เคยได้รีวิวใหม่เลยสักใบ = จับคู่สินค้าไม่ติด หรือกวาดไม่เจอ
      if (!meta?.at) {
        return {
          warn: true,
          note: `ตัวเก็บยิงเข้ามา ${ago(call.at)} (ส่ง ${call.sent ?? 0} · ผ่าน 0) แต่ยังไม่เคยได้รีวิวใหม่สักใบ`,
        };
      }
      const last = `ตัวเก็บมาล่าสุด ${ago(call.at)} · ส่ง ${call.sent ?? 0} ใหม่ ${call.added ?? 0} ซ้ำ ${call.dup ?? 0}`;
      return new Date(meta.at).getTime() < Date.now() - 7 * 86400000
        ? { note: `${last} · รีวิวใหม่ล่าสุด ${ago(meta.at)}${waiting}` }
        : { note: `${last}${waiting}` };
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
    // ⚠️ ห้าม list ทั้ง p/ — เคยสะสม 21,751 คีย์แล้วช่องนี้ขึ้น "ช้าผิดปกติ" 3 วิทุกครั้ง
    //    ดูแค่ 3 วันล่าสุดพอ (บอต Google มาแทบทุกวันอยู่แล้ว) · ของเก่าถูกกวาดตาม 30 วัน
    //    โดย sweep ของหน้าคนเข้าเว็บ (เพิ่ม p/ เข้ารายการกวาดแล้ว 28 ส.ค. 2569)
    check("ตัวจับบอต AI", async () => {
      const s = getStore({ name: "gucut-live", consistency: "eventual" });
      const days = [0, 1, 2].map((i) =>
        new Date(Date.now() + 7 * 3600 * 1000 - i * 86400000).toISOString().slice(0, 10));
      let n = 0;
      let latest = "";
      for (const d of days) {
        const { blobs } = await s.list({ prefix: `p/${d}/` });
        n += blobs.length;
        if (blobs.length && !latest) latest = d;
      }
      if (!n) return { warn: true, note: "3 วันล่าสุดไม่มีบอตเข้าเลย — ตัวดักที่ขอบอาจไม่ทำงาน" };
      return { note: `3 วันล่าสุดบอตเก็บไป ${n.toLocaleString("en-US")} หน้า · ล่าสุด ${latest}` };
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

    // ---------- คลังเงา (โครงการแก่น) ----------
    // ⚠️ วันนี้ (2 ก.ย. 2569) คลังเงาตายเงียบมาแล้ว 3 แบบ: ตารางไม่เคยถูกสร้าง ·
    //    ชนโควตาเขียนของ D1 · งานตามเวลาหยุดไปเฉย ๆ — ทุกครั้ง "ข้างนอกดูปกติทุกประการ"
    //    ตัวตรวจพวกนี้จึงต้องยิงของจริงและดู **ความสดของข้อมูล** ไม่ใช่แค่ต่อฐานติดไหม
    check("คลังเงา (ฐานข้อมูล D1)", async () => {
      if (!env.CLOUDFLARE_D1_TOKEN) return { off: true, note: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
      const { coreQuery } = await import("../lib/coredb.mjs");
      const [r] = await coreQuery(`SELECT COUNT(*) AS c FROM orders`);
      const n = Number(r?.c ?? 0);
      if (!n) return { warn: true, note: "ต่อฐานได้ แต่ยังไม่มีออเดอร์สักใบ" };
      return { note: `ออเดอร์ในคลังเงา ${n.toLocaleString("th-TH")} ใบ` };
    }),

    check("คลังเงาอัปเดตล่าสุด", async () => {
      if (!env.CLOUDFLARE_D1_TOKEN) return { off: true, note: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
      const { coreQuery } = await import("../lib/coredb.mjs");
      const [r] = await coreQuery(`SELECT MAX(updated_at) AS t FROM orders`);
      if (!r?.t) return { warn: true, note: "ไม่เคยมีการอัปเดตเลย" };
      // updated_at เป็นเวลา UTC จากฐาน — เทียบกับเวลาปัจจุบันแบบ UTC เท่านั้น
      const mins = Math.round((Date.now() - Date.parse(`${String(r.t).replace(" ", "T")}Z`)) / 60000);
      const when = `ล่าสุด ${mins < 60 ? `${mins} นาทีที่แล้ว` : `${Math.round(mins / 60)} ชม.ที่แล้ว`}`;
      // งานกระจกวิ่งทุกครึ่งชั่วโมง — เงียบเกิน 2 ชม. คือผิดปกติ
      if (mins > 120) return { warn: true, note: `${when} — งานกระจกน่าจะหยุด ควรเข้าไปดู` };
      return { note: when };
    }),

    check("ภาพถ่ายสต็อกรายวัน", async () => {
      if (!env.CLOUDFLARE_D1_TOKEN) return { off: true, note: "ยังไม่ได้ตั้ง CLOUDFLARE_D1_TOKEN" };
      const { coreQuery } = await import("../lib/coredb.mjs");
      const [r] = await coreQuery(
        `SELECT day, COUNT(*) AS c FROM stock_snapshots
         WHERE day = (SELECT MAX(day) FROM stock_snapshots) GROUP BY day`
      );
      if (!r?.day) return { warn: true, note: "ยังไม่มีภาพถ่ายสต็อกสักวัน" };
      const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
      const note = `${String(r.day)} · ${Number(r.c).toLocaleString("th-TH")} SKU`;
      // ถ่ายตอนตี 1 ทุกวัน — ถ้าภาพล่าสุดไม่ใช่วันนี้แปลว่ารอบตี 1 ไม่ได้ทำงาน
      return String(r.day) === today ? { note } : { warn: true, note: `${note} (ไม่ใช่ของวันนี้)` };
    }),

    check("ท่อ Shopee (ดึงออเดอร์/รีวิวเอง)", async () => {
      if (!env.SHOPEE_PARTNER_ID) return { off: true, note: "ยังไม่ได้ตั้งคีย์ Shopee" };
      const { validToken } = await import("../lib/shopee.mjs");
      const t = await validToken();
      return t ? { note: "เชื่อมร้านแล้ว ใช้งานได้" } : { warn: true, note: "ยังไม่ได้เชื่อมร้าน หรือ token หมดอายุ" };
    }),

    check("สะพานส่งบัญชีเข้า PEAK", async () => {
      const { peakStatus } = await import("../lib/peak.mjs");
      const r = await peakStatus();
      if (!r.ready) return { off: true, note: r.note ?? "ยังไม่ได้ตั้งคีย์ PEAK" };
      if (r.error) return { warn: true, note: r.error };
      return { note: r.live ? "เชื่อมได้ · เปิดส่งจริงแล้ว" : "เชื่อมได้ · ยังเป็นโหมดซ้อม" };
    }),
  ]);

  return json({ at: Date.now(), checks });
}

export const config = { path: "/api/status" };
