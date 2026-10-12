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
  couponStore, findCoupon, publicCoupon, readCouponsForWrite,
  อ่านโค้ดพร้อมสถานะ, ตรวจโค้ดไม่ได้,
  validate, writeCoupons,
} from "../lib/coupons.mjs";
import { currentUserState, store as usersStore } from "../lib/session.mjs";

const MAX_TRIES = 20;                 // ลองผิดได้กี่ครั้งต่อ IP
const WINDOW_MS = 10 * 60 * 1000;

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

const up = (v) => String(v ?? "").trim().toUpperCase().slice(0, 40);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/* ⚠️ **`x-forwarded-for` ต้องอ่าน "ตัวท้าย" ไม่ใช่ตัวหน้า** (ฝั่งจอทักมา 6 ก.ย. 2569)
    ลูกค้าส่งหัวนี้มาเองได้ ⇒ **ตัวหน้าคือค่าที่ลูกค้าพิมพ์เอง** เปลี่ยนได้ทุกครั้งที่ยิง
    ⇒ ตัวนับที่ผูกกับตัวหน้า = ยิงเดาได้ไม่จำกัด **ตัวกันเดาเท่ากับไม่มี**
    ตัวที่ผู้ให้บริการเติมท้ายสุดคือค่าที่ใกล้ความจริงที่สุดเท่าที่ชั้นนี้จะรู้ได้
    ⚠️ ตัวนี้เป็น**ทางสำรองชั้นที่สาม**เท่านั้น — ปกติ `context.ip` ของ Netlify มาก่อนเสมอ */
const lastForwardedFor = (req) => {
  const raw = req?.headers?.get?.("x-forwarded-for");
  if (!raw) return "";
  const parts = String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
};

const who = (req, context) =>
  context?.ip ||
  req.headers.get("x-nf-client-connection-ip") ||
  lastForwardedFor(req) ||
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

/* 🔴 **B26 ส่วนที่ยังค้าง (แก้ 12 ต.ค. 2569)** — คืน null ทั้ง "ไม่ได้ล็อกอิน" และ "อ่านไม่ได้"
   ⇒ โค้ดที่ตั้ง `memberOnly` ตอบ **"โค้ดนี้สำหรับสมาชิก — เข้าสู่ระบบก่อนใช้ได้เลย"**
     ให้คนที่ **ล็อกอินอยู่แล้ว** ⇒ เขากดเข้าสู่ระบบซ้ำแล้วก็เจอเหมือนเดิม
   ⇒ คืนสามสถานะขึ้นไป ให้ผู้เรียกเลือกเองว่าจะพูดอะไร
   ⚠️ ทิศเดิมคงไว้: ระบบสมาชิกล่ม **ยังให้ใช้โค้ดทั่วไปได้** (ไม่ล้มหน้าเช็คเอาต์) */
const meState = async (req) =>
  currentUserState(req, usersStore()).catch((err) => ({ state: "unknown", err }));
const me = async (req) => {
  const r = await meState(req);
  return r.state === "user" ? r.user : null;
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
      /* 🔴 **B18 (แก้ 12 ต.ค. 2569)** — เดิม `readCoupons` กลืนความล้มเหลวเป็น `[]`
         ⇒ ตารางหลังร้านขึ้น **ว่าง** ตอน Blobs สะดุด · ไฟล์ `coupons.mjs` เตือนไว้เองว่า
           "GET ?all ได้ตารางว่าง ⇒ คนใช้จะสร้างใหม่ ซึ่งคือจังหวะที่เขียนทับพอดี"
         ⇒ คำเตือนนั้นอยู่ในไฟล์มาตั้งแต่ 6 ก.ย. แต่ **เส้นนี้ยังกลืนอยู่** ⇒ ปิดให้ตรงนี้
         🔑 ทางอ่านของ *เจ้าของร้าน* ต้องบอกว่าอ่านไม่ได้ ไม่ใช่โชว์ว่าง —
            เพราะคนที่เห็นตารางว่างจะลงมือ **เขียน** ต่อทันที */
      const { list: ทั้งหมด, อ่านไม่ได้ } = await อ่านโค้ดพร้อมสถานะ(s);
      if (อ่านไม่ได้) {
        return json({ error: "อ่านรายชื่อโค้ดไม่ได้ชั่วคราว — **ห้ามสร้างโค้ดใหม่ตอนนี้** "
          + "เพราะการบันทึกจะเขียนทับรายชื่อเดิมที่ยังอ่านไม่ได้ · ลองรีเฟรชอีกครั้ง" }, 503);
      }
      return json({ all: ทั้งหมด.filter((c) => !c.fromEnv) });
    }

    const user = await me(req);
    /* ทางนี้ **กลืนต่อโดยตั้งใจ** — หน้าร้านต้องไม่ล้มเพราะ Blobs สะดุด
       แต่แนบ `อ่านไม่ได้` ไปให้จอ เพื่อให้จอเขียนว่า "ยังโหลดโปรโมชันไม่ได้"
       ไม่ใช่ "ไม่มีโปรโมชัน" ⇒ รายการว่างสองความหมาย ต้องแยกให้จอเห็น
       (จอยังไม่ใช้ช่องนี้ก็ไม่พัง — เพิ่มช่อง ไม่ได้เปลี่ยนรูปเดิม) */
    const { list: ทั้งหมด, อ่านไม่ได้ } = await อ่านโค้ดพร้อมสถานะ(s);
    const list = ทั้งหมด
      .filter((c) => c.visible !== false && !c.off && !c.fromEnv)
      .map(publicCoupon);
    return json({ coupons: list, mine: user?.coupons ?? {}, อ่านไม่ได้ });
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

    /* 🔴 **ทางนี้เขียนทับของเดิมทั้งก้อน ⇒ ต้องรู้ให้ได้ว่า "ไม่มีโค้ด" กับ "อ่านไม่ได้" ต่างกัน**
        อ่านไม่ได้แล้วเขียนต่อ = โค้ดทุกใบที่ร้านเคยสร้างหายถาวร พร้อมตัวนับ used
        ⇒ อ่านพลาด **ไม่เขียนอะไรเลย** แล้วบอกตรง ๆ ว่ายังไม่ได้แก้ (ไม่ใช่ตอบ ok:true) */
    let list;
    try {
      list = await readCouponsForWrite(s);
    } catch (e) {
      return json(
        {
          error: "อ่านรายการโค้ดเดิมไม่ได้ จึงยังไม่ได้แก้อะไร — ลองใหม่อีกครั้ง",
          why: String(e?.message || e).slice(0, 160),
          changed: false,
        },
        503
      );
    }

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
  /* 🔴 **B26** — ต้องรู้ด้วยว่า "ไม่ใช่สมาชิก" เพราะไม่ได้ล็อกอิน หรือเพราะ **ถามไม่ได้**
     เพราะโค้ดที่ตั้ง `memberOnly` จะตอบ "เข้าสู่ระบบก่อนใช้ได้เลย" ให้คนที่ล็อกอินอยู่ */
  const สภาพฉัน = await meState(req);
  const user = สภาพฉัน.state === "user" ? สภาพฉัน.user : null;

  // ---------- กดเก็บโค้ดเข้าบัญชี ----------
  if (action === "collect") {
    if (สภาพฉัน.state === "unknown") {
      return json({ ok: false, ตรวจไม่ได้: true,
        error: "ตรวจสถานะสมาชิกไม่ได้ชั่วคราว — **ไม่ใช่ว่าคุณหลุดจากระบบ** ลองกดอีกครั้ง" }, 503);
    }
    if (!user) return json({ ok: false, error: "เข้าสู่ระบบก่อนถึงจะเก็บโค้ดได้" }, 401);
    /* ทางนี้ก็พูดผิดแบบเดียวกัน: อ่านไม่ได้ ⇒ "ไม่มีโค้ดนี้แล้ว" ⇒ ลูกค้าเชื่อว่าโค้ดถูกถอน
       ⚠️ ต่างจากทางตรวจ: ทางนี้ **เขียนบัญชีลูกค้า** ⇒ อ่านไม่ได้แล้วเขียนต่อไม่ได้อยู่ดี
          ⇒ ตอบว่าตรวจไม่ได้ ให้เขากดใหม่ ไม่ใช่บอกว่าโค้ดหายไปแล้ว */
    const { list: มีอยู่, อ่านไม่ได้: โค้ดอ่านไม่ได้ } = await อ่านโค้ดพร้อมสถานะ(s);
    const c = findCoupon(มีอยู่, code);
    if (!c && โค้ดอ่านไม่ได้) return json(ตรวจโค้ดไม่ได้());
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

  /* 🔴 **B18 ส่วนที่ยังค้าง (แก้ 12 ต.ค. 2569)** — เดิมใช้ `allCoupons` ซึ่งกลืน
     ความล้มเหลวของ Blobs เป็น `[]` ⇒ `validate(undefined)` ตอบ
     **"ไม่มีโค้ดนี้ หรือโค้ดหมดอายุแล้ว"** ⇒ ลูกค้าที่ถือโค้ดจริงถูกบอกว่าโค้ดเขาไม่มีอยู่
     ⇒ ⇒ ทิศของเงินถูกแล้ว (ไม่ให้ส่วนลด) แต่ **ถ้อยคำผิด** และราคาของถ้อยคำผิดทางนี้คือ
        ลูกค้าเลิกลอง/ทิ้งตะกร้า/ทักมาว่าร้านโกง — แพงกว่าให้เขารอหนึ่งนาที
     🔑 "ไม่ให้ส่วนลด" กับ "บอกว่าโค้ดไม่มีอยู่" เป็นสองเรื่อง · ของเดิมทำทั้งสอง
     ⚠️ ลำดับสำคัญ: ถ้า **เจอโค้ด** (รวมโค้ดลับจาก env ที่ใช้ได้แม้ Blobs ล่ม) ⇒ ตรวจปกติ
        พูดว่า "ตรวจไม่ได้" เฉพาะตอน **ไม่เจอ และ อ่านไม่ได้** เท่านั้น
        ไม่งั้นโค้ดที่ไม่มีอยู่จริงจะได้ข้อความกำกวมตอน Blobs ล่ม */
  const { list, อ่านไม่ได้ } = await อ่านโค้ดพร้อมสถานะ(s);
  const c = findCoupon(list, code);
  if (!c && อ่านไม่ได้) return json(ตรวจโค้ดไม่ได้());
  /* 🔴 **B26** — โค้ดเฉพาะสมาชิก + ถามตัวตนไม่ได้ ⇒ ห้ามบอกว่า "เข้าสู่ระบบก่อน"
     เพราะเขาอาจล็อกอินอยู่แล้ว · กดเข้าสู่ระบบซ้ำก็เจอเหมือนเดิม = ทางตัน */
  if (c?.memberOnly && สภาพฉัน.state === "unknown") {
    return json({ ok: false, ตรวจไม่ได้: true,
      error: "โค้ดนี้สำหรับสมาชิก และตอนนี้ **ตรวจสถานะสมาชิกไม่ได้** — ลองกดอีกครั้งในอีกสักครู่" });
  }
  const r = validate(c, subtotal, user);
  return json(r.ok ? { ok: true, code: r.code, discount: r.discount, label: r.label } : r);
}

export const config = { path: "/api/coupon" };
