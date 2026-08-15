// โค้ดส่วนลด — /api/coupon
//
//   GET  /api/coupon                            โค้ดที่โชว์ให้ลูกค้าเห็น + โค้ดที่ฉันเก็บไว้
//   POST {action:"check",   code, subtotal}     ตรวจว่าใช้กับยอดนี้ได้ไหม
//   POST {action:"collect", code}               กดเก็บโค้ดเข้าบัญชี (ต้องล็อกอิน)
//   POST {action:"save",    coupon}             สร้าง/แก้โค้ด (ต้องมีรหัสหลังร้าน)
//   POST {action:"delete",  code}               ลบโค้ด (ต้องมีรหัสหลังร้าน)
//
// ⚠️ ต้องตรวจที่นี่เท่านั้น ห้ามย้ายไปตรวจในเบราว์เซอร์
//    ถึงตัวโค้ดจะไม่ลับแล้ว (โชว์ให้กดเก็บแบบ Shopee) แต่เพดานส่วนลด โควตา
//    และจำนวนครั้งต่อคน ถ้าเช็คฝั่งลูกค้าจะปลอมได้ทันที
import { adminGate } from "../lib/admin-gate.mjs";
import {
  allCoupons, couponStore, findCoupon, publicCoupon, readCoupons, validate, writeCoupons,
} from "../lib/coupons.mjs";
import { currentUser, store as usersStore } from "../lib/session.mjs";

const MAX_TRIES = 20;                 // ลองผิดได้กี่ครั้งต่อ IP
const WINDOW_MS = 10 * 60 * 1000;

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

const up = (v) => String(v ?? "").trim().toUpperCase().slice(0, 40);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const who = (req, context) =>
  context?.ip ||
  req.headers.get("x-nf-client-connection-ip") ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "unknown";

// กันยิงเดาโค้ดรัว ๆ — นับแยกตาม IP
async function tooMany(s, ip) {
  const now = Date.now();
  const rl = (await s.get(`rl/${ip}`, { type: "json" }).catch(() => null)) || { n: 0, start: now };
  if (now - rl.start > WINDOW_MS) { rl.n = 0; rl.start = now; }
  if (rl.n >= MAX_TRIES) return true;
  rl.n += 1;
  await s.setJSON(`rl/${ip}`, rl).catch(() => {});
  return false;
}

const me = async (req) => {
  try {
    const found = await currentUser(req, usersStore());
    return found?.user ?? null;
  } catch {
    return null;   // ระบบสมาชิกล่ม — ยังให้ใช้โค้ดทั่วไปได้ตามปกติ
  }
};

export default async function handler(req, context) {
  let s;
  try { s = couponStore(); } catch { return json({ error: "store unavailable" }, 503); }

  // ---------- รายการโค้ดที่โชว์ให้ลูกค้าเห็น ----------
  if (req.method === "GET") {
    // ฝั่งร้านขอดูทุกโค้ด รวมของที่ปิดอยู่และของลับ (ต้องมีรหัสหลังร้าน)
    if (new URL(req.url).searchParams.get("all")) {
      const gate = await adminGate(req, context);
      if (gate.deny) return gate.deny;
      if (!gate.ok) return json({ error: "unauthorized" }, 401);
      return json({ all: await readCoupons(s) });
    }

    const user = await me(req);
    const list = (await readCoupons(s))
      .filter((c) => c.visible !== false && !c.off)
      .map(publicCoupon);
    return json({ coupons: list, mine: user?.coupons ?? {} });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const action = String(body.action || "check");

  // ---------- ฝั่งร้าน: สร้าง / แก้ / ลบ ----------
  if (action === "save" || action === "delete") {
    const gate = await adminGate(req, context);
    if (gate.deny) return gate.deny;
    if (!gate.ok) return json({ error: "unauthorized" }, 401);

    const list = await readCoupons(s);

    if (action === "delete") {
      const code = up(body.code);
      await writeCoupons(s, list.filter((x) => up(x.code) !== code));
      return json({ ok: true });
    }

    const c = body.coupon || {};
    const code = up(c.code);
    if (!code) return json({ error: "ต้องมีตัวโค้ด" }, 400);
    if (!["amount", "percent"].includes(c.type)) return json({ error: "ชนิดโค้ดไม่ถูกต้อง" }, 400);
    if (num(c.value) <= 0) return json({ error: "ส่วนลดต้องมากกว่า 0" }, 400);

    const next = {
      code,
      title: String(c.title || "").trim().slice(0, 60),
      type: c.type,
      value: num(c.value),
      max: num(c.max),
      min: num(c.min),
      until: /^\d{4}-\d{2}-\d{2}$/.test(c.until || "") ? c.until : "",
      quota: num(c.quota),
      perUser: num(c.perUser, 1),
      visible: c.visible !== false,
      memberOnly: !!c.memberOnly,
      off: !!c.off,
      // ใช้ไปแล้วกี่ครั้ง — ห้ามให้แก้จากหน้าจอ เอาของเดิมมาเสมอ
      used: num(findCoupon(list, code)?.used),
    };
    const rest = list.filter((x) => up(x.code) !== code);
    await writeCoupons(s, [...rest, next]);
    return json({ ok: true, coupon: next });
  }

  const code = up(body.code);
  if (!code) return json({ ok: false, error: "ใส่โค้ดส่วนลดก่อนครับ" });
  const user = await me(req);

  // ---------- กดเก็บโค้ดเข้าบัญชี ----------
  if (action === "collect") {
    if (!user) return json({ ok: false, error: "เข้าสู่ระบบก่อนถึงจะเก็บโค้ดได้" }, 401);
    const c = findCoupon(await readCoupons(s), code);
    if (!c || c.off || c.visible === false) return json({ ok: false, error: "ไม่มีโค้ดนี้แล้ว" });

    const us = usersStore();
    const key = `u/${user.phone}`;
    const u = await us.get(key, { type: "json" }).catch(() => null);
    if (!u) return json({ ok: false, error: "ไม่พบบัญชี" }, 404);
    u.coupons = u.coupons || {};
    if (!u.coupons[code]) u.coupons[code] = { collected: Date.now(), used: 0 };
    await us.setJSON(key, u);
    return json({ ok: true, mine: u.coupons });
  }

  // ---------- ตรวจว่าใช้กับยอดนี้ได้ไหม ----------
  const subtotal = Number(body.subtotal);
  if (!Number.isFinite(subtotal) || subtotal <= 0) return json({ error: "bad subtotal" }, 400);
  if (await tooMany(s, who(req, context))) {
    return json({ ok: false, error: "ลองใส่โค้ดบ่อยเกินไป รออีกสักครู่แล้วลองใหม่" });
  }

  const c = findCoupon(await allCoupons(s), code);
  const r = validate(c, subtotal, user);
  return json(r.ok ? { ok: true, code: r.code, discount: r.discount, label: r.label } : r);
}

export const config = { path: "/api/coupon" };
