// บัญชีลูกค้า — /api/auth
// สมัคร/เข้าสู่ระบบด้วย เบอร์โทร + รหัสผ่าน (หรือผูกกับ LINE/Facebook)  เก็บที่ Netlify Blobs (ของ Netlify เอง ไม่มีค่าใช้จ่าย)
//
//   GET  /api/auth                                  ฉันเป็นใคร (อ่านจาก cookie)
//   POST /api/auth {action:"register",phone,name,password,remember}
//   POST /api/auth {action:"login",phone,password,remember}   remember:false = ปิดเบราว์เซอร์แล้วหลุด
//   POST /api/auth {action:"logout"}
//   POST /api/auth {action:"profile",name,addr}     แก้ชื่อ / ที่อยู่จัดส่ง
//   POST /api/auth {action:"password",old,next}     ตั้ง/เปลี่ยนรหัสผ่าน
//   POST /api/auth {action:"social-link",phone,password?} ผูกบัญชี LINE/Facebook เข้ากับเบอร์ (ดู lib/oauth.mjs)
//   GET  /api/auth?pending=1                        ดูว่ามีบัญชีภายนอกรอผูกเบอร์อยู่ไหม
//
// รหัสผ่านไม่ถูกเก็บเป็นตัวหนังสือ — เก็บเป็น scrypt hash + salt สุ่มรายคน
// ถึงใครหลุดเข้ามาดูฐานข้อมูลก็อ่านรหัสลูกค้าไม่ได้
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { claimPending } from "../lib/points.mjs";
import {
  LINK_COOKIE, clean, currentUser, json, killCookie, killShort, newSession,
  normPhone, publicUser, readCookie, setCookie, store,
} from "../lib/session.mjs";

const MAX_FAILS = 8;              // ใส่รหัสผิดเกินนี้ พักไว้ 15 นาที
const LOCK_MS = 15 * 60 * 1000;
const LINK_TTL = 20 * 60 * 1000;  // บัญชีภายนอกที่รอผูกเบอร์ อยู่ได้ 20 นาที

function hashPw(pw, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(pw, salt, 64).toString("hex") };
}
function checkPw(pw, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const a = Buffer.from(rec.hash, "hex");
  const b = scryptSync(pw, rec.salt, a.length);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req) {
  let s;
  try { s = store(); } catch { return json({ error: "store unavailable" }, 503); }

  if (req.method === "GET") {
    // หน้า /account/link/ ถามว่ามีบัญชี LINE ค้างรอผูกเบอร์อยู่ไหม
    if (new URL(req.url).searchParams.get("pending")) {
      const p = await pendingLink(req, s);
      return json({
        pending: p ? { provider: p.provider, label: p.label, name: p.name, picture: p.picture } : null,
      });
    }
    const me = await currentUser(req, s);
    return json({ user: me ? publicUser(me.user) : null });
  }
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const action = String(body.action || "");
  const keep = body.remember !== false;

  // ---------- ออกจากระบบ ----------
  if (action === "logout") {
    const tok = readCookie(req, "gu_sess");
    if (tok) await s.delete(`s/${tok}`).catch(() => {});
    return json({ ok: true }, 200, killCookie());
  }

  // ---------- สมัครสมาชิก ----------
  if (action === "register") {
    const phone = normPhone(body.phone);
    const name = clean(body.name, 60);
    const pw = String(body.password ?? "");
    if (!phone) return json({ error: "เบอร์โทรไม่ถูกต้อง" }, 400);
    if (!name) return json({ error: "กรอกชื่อด้วยครับ" }, 400);
    if (pw.length < 8) return json({ error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัว" }, 400);
    if (pw.length > 128) return json({ error: "รหัสผ่านยาวเกินไป" }, 400);

    const exists = await s.get(`u/${phone}`, { type: "json" }).catch(() => null);
    if (exists) return json({ error: "เบอร์นี้สมัครไว้แล้ว — กดเข้าสู่ระบบได้เลย" }, 409);

    const u = { phone, name, pass: hashPw(pw), created: Date.now(), addr: null };
    await s.setJSON(`u/${phone}`, u);
    // ลูกค้าเก่าที่ร้านพักแต้มไว้ให้ตามเบอร์ — โอนเข้าบัญชีทันทีที่สมัครเสร็จ
    await claimPending(s, phone).catch(() => {});
    const fresh = (await s.get(`u/${phone}`, { type: "json" }).catch(() => null)) || u;
    const token = await newSession(s, phone);
    return json({ ok: true, user: publicUser(fresh) }, 200, setCookie(token, keep));
  }

  // ---------- เข้าสู่ระบบ ----------
  if (action === "login") {
    const phone = normPhone(body.phone);
    const pw = String(body.password ?? "");
    if (!phone || !pw) return json({ error: "กรอกเบอร์และรหัสผ่านให้ครบ" }, 400);

    const locked = await checkLock(s, phone);
    if (locked) return locked;

    const u = await s.get(`u/${phone}`, { type: "json" }).catch(() => null);
    // ข้อความเดียวกันทั้งกรณีไม่มีเบอร์นี้และรหัสผิด — ไม่บอกคนนอกว่าเบอร์ไหนเป็นสมาชิก
    if (!u || !checkPw(pw, u.pass)) {
      await addFail(s, phone);
      return json({ error: "เบอร์หรือรหัสผ่านไม่ถูกต้อง" }, 401);
    }
    await s.delete(`rl/${phone}`).catch(() => {});
    // มีแต้มเก่าที่ร้านพักไว้ตามเบอร์นี้ก็โอนเข้าบัญชีให้เลย (ทำครั้งเดียวแล้วหมด)
    await claimPending(s, phone).catch(() => {});
    const fresh = (await s.get(`u/${phone}`, { type: "json" }).catch(() => null)) || u;
    const token = await newSession(s, phone);
    return json({ ok: true, user: publicUser(fresh) }, 200, setCookie(token, keep));
  }

  // ---------- ผูกบัญชีภายนอก (LINE / Facebook) เข้ากับเบอร์โทร ----------
  // มาจาก /api/oauth/<เจ้า>/callback ที่ยังไม่รู้จักบัญชีนี้
  if (action === "social-link") {
    const p = await pendingLink(req, s);
    if (!p) return json({ error: "หมดเวลาผูกบัญชีแล้ว กดเข้าสู่ระบบใหม่อีกครั้ง" }, 400);

    const phone = normPhone(body.phone);
    if (!phone) return json({ error: "เบอร์โทรไม่ถูกต้อง" }, 400);

    const locked = await checkLock(s, phone);
    if (locked) return locked;

    const info = { id: p.id, name: p.name, picture: p.picture };
    let u = await s.get(`u/${phone}`, { type: "json" }).catch(() => null);
    if (u) {
      // เบอร์นี้มีบัญชีอยู่แล้ว — ต้องยืนยันรหัสผ่านก่อน กันคนอื่นสวมเบอร์เรา
      if (u.pass) {
        const pw = String(body.password ?? "");
        if (!pw) return json({ error: "need-password", phone }, 428);
        if (!checkPw(pw, u.pass)) {
          await addFail(s, phone);
          return json({ error: "รหัสผ่านไม่ถูกต้อง" }, 401);
        }
      }
      // บัญชีเดิมไม่มีรหัสผ่าน (สร้างจากบัญชีภายนอก) และผูกกับคนอื่นของเจ้าเดียวกันอยู่
      else {
        const cur = (u.social || {})[p.provider] || (p.provider === "line" ? u.line : null);
        if (cur && cur.id !== p.id) {
          // ⚠️ ช่วงย้ายบ้าน LINE (27 ส.ค. 2569 ย้าย channel มา provider ZORT)
          // ลูกค้าเก่าทุกคนได้ userId ใหม่ — id เก่าตายไปพร้อม channel เดิม ล็อกอินซ้ำไม่ได้อีก
          // จึงยอมให้ "ผูกทับ" เฉพาะ LINE ถึง 1 ธ.ค. 2569 พร้อมตาข่าย:
          // เก็บ id เก่าไว้ตรวจย้อน + เด้ง Telegram ให้ร้านเห็นทุกครั้ง (จับคนสวมเบอร์ได้)
          const migrating = p.provider === "line" && Date.now() < Date.parse("2026-12-01T00:00:00+07:00");
          if (!migrating) {
            return json({ error: `เบอร์นี้ผูกกับบัญชี ${p.label} อื่นอยู่แล้ว` }, 409);
          }
          u.linePrevIds = [...(u.linePrevIds || []), cur.id];
          await s.delete(`oa/line/${cur.id}`).catch(() => {});
          if (u.line) delete u.line;
          const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
          if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
            await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: `🔁 ลูกค้าเบอร์ ${phone} ผูก LINE ใหม่แทนบัญชีเดิม (ย้าย channel)\nชื่อใน LINE: ${p.name || "-"}\nถ้าลูกค้าไม่ได้ทำเอง ทักร้านมาเช็คได้`,
              }),
              signal: AbortSignal.timeout(3000),
            }).catch(() => {});
          }
        }
      }
      u.social = { ...(u.social || {}), [p.provider]: info };
      if (!u.name) u.name = p.name;
    } else {
      u = {
        phone,
        name: p.name || "",
        pass: null,                 // ล็อกอินด้วยบัญชีภายนอกอย่างเดียว ตั้งรหัสทีหลังได้
        created: Date.now(),
        addr: null,
        social: { [p.provider]: info },
      };
    }

    await s.setJSON(`u/${phone}`, u);
    await s.setJSON(`oa/${p.provider}/${p.id}`, { phone });
    await s.delete(`pl/${p.token}`).catch(() => {});
    await s.delete(`rl/${phone}`).catch(() => {});
    // เข้าด้วย LINE/Facebook/Google ครั้งแรกก็ต้องได้แต้มเก่าที่พักไว้ตามเบอร์เหมือนกัน
    await claimPending(s, phone).catch(() => {});
    u = (await s.get(`u/${phone}`, { type: "json" }).catch(() => null)) || u;

    const token = await newSession(s, phone);
    return json({ ok: true, user: publicUser(u) }, 200, [
      setCookie(token, keep),
      killShort(LINK_COOKIE),
    ]);
  }

  // ---------- ที่เหลือต้องล็อกอินก่อน ----------
  const me = await currentUser(req, s);
  if (!me) return json({ error: "ยังไม่ได้เข้าสู่ระบบ" }, 401);

  if (action === "profile") {
    const u = me.user;
    if (body.name !== undefined) u.name = clean(body.name, 60) || u.name;
    if (body.addr !== undefined) {
      const a = body.addr || {};
      u.addr = {
        name: clean(a.name, 60),
        phone: normPhone(a.phone) || clean(a.phone, 20),
        address: clean(a.address, 300),
        province: clean(a.province, 60),
        zip: clean(a.zip, 5),
      };
    }
    await s.setJSON(`u/${u.phone}`, u);
    return json({ ok: true, user: publicUser(u) });
  }

  if (action === "password") {
    const u = me.user;
    const next = String(body.next ?? "");
    // บัญชีที่มาจาก LINE ยังไม่มีรหัสผ่าน — ตั้งครั้งแรกได้เลย ไม่ต้องถามรหัสเดิม
    if (u.pass && !checkPw(String(body.old ?? ""), u.pass)) {
      return json({ error: "รหัสผ่านเดิมไม่ถูกต้อง" }, 401);
    }
    if (next.length < 8) return json({ error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัว" }, 400);
    if (next.length > 128) return json({ error: "รหัสผ่านยาวเกินไป" }, 400);
    u.pass = hashPw(next);
    await s.setJSON(`u/${u.phone}`, u);
    return json({ ok: true, user: publicUser(u) });
  }

  return json({ error: "unknown action" }, 400);
}

/** อ่านบัญชีภายนอกที่รอผูกเบอร์ จาก cookie ชั่วคราว */
async function pendingLink(req, s) {
  const tok = readCookie(req, LINK_COOKIE);
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(tok)) return null;
  const p = await s.get(`pl/${tok}`, { type: "json" }).catch(() => null);
  if (!p?.id || !p?.provider) return null;
  if (Date.now() - (p.at || 0) > LINK_TTL) {
    await s.delete(`pl/${tok}`).catch(() => {});
    return null;
  }
  return { ...p, token: tok };
}

/** กันเดารหัสรัว ๆ */
async function checkLock(s, phone) {
  const rl = (await s.get(`rl/${phone}`, { type: "json" }).catch(() => null)) || { fails: 0, until: 0 };
  if (rl.until > Date.now()) {
    const min = Math.ceil((rl.until - Date.now()) / 60000);
    return json({ error: `ใส่รหัสผิดหลายครั้งเกินไป ลองใหม่ในอีก ${min} นาที` }, 429);
  }
  return null;
}
async function addFail(s, phone) {
  const rl = (await s.get(`rl/${phone}`, { type: "json" }).catch(() => null)) || { fails: 0, until: 0 };
  const fails = rl.fails + 1;
  await s.setJSON(`rl/${phone}`, {
    fails: fails >= MAX_FAILS ? 0 : fails,
    until: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0,
  });
}

export const config = { path: "/api/auth" };
