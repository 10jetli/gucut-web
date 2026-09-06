// ด่านตรวจรหัสหลังร้าน — ที่เดียวที่ทุก API หลังร้านใช้ร่วมกัน
//
// เดิมแต่ละไฟล์เทียบรหัสเองด้วย sent === adminKey เฉย ๆ ซึ่งมีปัญหาสองข้อ
//   1. ใส่รหัสผิดได้ไม่จำกัดครั้ง ยิงเดารหัสรัว ๆ ได้ (ฝั่งลูกค้ามีกันไว้แล้ว แต่หลังร้านไม่มี)
//   2. เทียบสตริงตรง ๆ ใช้เวลาต่างกันตามจำนวนตัวอักษรที่ตรง เดารหัสทีละตัวได้ในทางทฤษฎี
//
// ไฟล์นี้แก้ทั้งสองข้อ และให้ทุก API หลังร้านใช้กติกาเดียวกัน
import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

const MAX_FAILS = 5;                  // ใส่รหัสผิดเกินนี้ พักไว้
const LOCK_MS = 15 * 60 * 1000;       // นานเท่านี้

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

// เทียบรหัสแบบใช้เวลาเท่ากันเสมอ ไม่ว่าจะตรงกี่ตัว
function same(a, b) {
  const x = Buffer.from(String(a), "utf8");
  const y = Buffer.from(String(b), "utf8");
  if (x.length !== y.length) {
    // ยังเทียบให้ครบรอบ เพื่อไม่ให้ความยาวรหัสรั่วออกไปทางเวลา
    timingSafeEqual(x, x);
    return false;
  }
  return timingSafeEqual(x, y);
}

// ใครเป็นคนยิงมา — นับครั้งที่ผิดแยกตาม IP
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

const store = () => getStore({ name: "gucut-admin", consistency: "strong" });

/**
 * ตรวจรหัสหลังร้านจาก header x-admin-key
 * คืน { wants, ok, deny }
 *   wants = ส่งรหัสมาด้วยไหม (ไม่ส่ง = เป็นลูกค้าทั่วไป ไม่ใช่เรื่องผิด)
 *   ok    = รหัสถูก
 *   deny  = ถ้ามีค่า ให้ API ตอบตัวนี้กลับไปเลย (รหัสผิด หรือโดนพักอยู่)
 */
export async function adminGate(req, context) {
  const sent = req.headers.get("x-admin-key") || "";
  if (!sent) return { wants: false, ok: false, deny: null };

  const real = process.env.CHAT_ADMIN_KEY || "";
  if (!real) return { wants: true, ok: false, deny: json({ error: "unauthorized" }, 401) };

  const ip = who(req, context);
  let s = null;
  try { s = store(); } catch { /* Blobs ล่ม — ยังตรวจรหัสตามปกติ แค่ไม่นับครั้งที่ผิด */ }

  // โดนพักอยู่หรือเปล่า
  if (s) {
    const rl = (await s.get(`rl/${ip}`, { type: "json" }).catch(() => null)) || { fails: 0, until: 0 };
    if (rl.until > Date.now()) {
      const min = Math.ceil((rl.until - Date.now()) / 60000);
      return {
        wants: true, ok: false,
        deny: json({ error: `ใส่รหัสผิดหลายครั้งเกินไป ลองใหม่ในอีก ${min} นาที` }, 429),
      };
    }
  }

  if (same(sent, real)) {
    // ถูกแล้ว ล้างประวัติที่ผิดไว้ทิ้ง
    if (s) await s.delete(`rl/${ip}`).catch(() => {});
    return { wants: true, ok: true, deny: null };
  }

  // ผิด — นับเพิ่ม ครบโควตาแล้วพักยาว
  if (s) {
    const rl = (await s.get(`rl/${ip}`, { type: "json" }).catch(() => null)) || { fails: 0, until: 0 };
    const fails = rl.fails + 1;
    await s.setJSON(`rl/${ip}`, {
      fails: fails >= MAX_FAILS ? 0 : fails,
      until: fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0,
    }).catch(() => {});
  }
  return { wants: true, ok: false, deny: json({ error: "unauthorized" }, 401) };
}
