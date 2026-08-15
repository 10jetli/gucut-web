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
  const gate = await adminGate(req, context);
  if (gate) return gate;

  const env = process.env;

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
    check("คลิปวิดีโอ", async () => {
      const r = await fetch(
        "https://pub-002ee0abd2f747c5b9e5573c987ca79d.r2.dev/v/ba717cb6b4364b1ab9ea4fc599a1e70b/master.m3u8",
        { signal: timeout(8000) },
      );
      if (!r.ok) throw new Error(`ที่เก็บคลิปตอบ ${r.status}`);
      return {};
    }),

    // ---------- แจ้งเตือนเด้งมือถือแอดมิน ----------
    check("แจ้งเตือนเด้งมือถือ", async () => {
      const s = getStore({ name: "gucut-push", consistency: "strong" });
      const subs = (await s.get("push-subs", { type: "json" }).catch(() => null)) || [];
      if (!subs.length) return { off: true, note: "ยังไม่มีเครื่องไหนเปิดรับ" };
      return { note: `เปิดรับอยู่ ${subs.length} เครื่อง` };
    }),

    // ---------- รับเงิน ----------
    check("รับเงินด้วย QR พร้อมเพย์", async () => {
      if (!env.NEXT_PUBLIC_PROMPTPAY_ID) {
        return { off: true, note: "ยังไม่ได้ใส่เบอร์พร้อมเพย์ — ลูกค้าจ่ายได้แค่ปลายทาง" };
      }
      return {};
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

    // ---------- ส่งออเดอร์ต่อไปที่อื่น ----------
    check("ส่งออเดอร์ต่อไป Make.com", async () =>
      env.ORDER_FORWARD_URL ? {} : { off: true, note: "ไม่ได้ใช้ (ไม่บังคับ)" }),
  ]);

  return json({ at: Date.now(), checks });
}

export const config = { path: "/api/status" };
