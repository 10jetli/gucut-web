// แต้มสะสม — /api/points
//
//   GET  /api/points                          กติกา + แต้มของฉัน + ประวัติ (ถ้าล็อกอิน)
//   POST {action:"settings", ...}             ตั้งกติกา (ต้องมีรหัสหลังร้าน)
//   POST {action:"adjust", phone, n, note}    เพิ่ม/ลดแต้มให้ลูกค้ามือ (ต้องมีรหัสหลังร้าน)
//
// แต้มถูกบวกจริงตอนออเดอร์ "สำเร็จ" และถูกหักตอนสั่งซื้อ — ทำใน /api/orders
// ที่นี่มีไว้ให้ดูและให้ร้านตั้งค่าเท่านั้น
import { adminGate } from "../lib/admin-gate.mjs";
import { addPending, addPoints, readLoyalty, writeLoyalty } from "../lib/points.mjs";
import { currentUserState, normPhone, store as usersStore } from "../lib/session.mjs";

const json = (o, s = 200, extra = {}) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", ...extra } });

export default async function handler(req, context) {
  const cfg = await readLoyalty();

  if (req.method === "GET") {
    /* 🔴 B04 ตระกูลเดียวกัน ขา GET (แก้ 12 ต.ค. 2569) — ใบงานชี้ `addPending` ซึ่งถูกแก้ไปแล้ว 14 ก.ย.
       (อ่านพลาด = throw · ผู้เรียกที่ `/api/points` ไม่ได้ห่อ catch ⇒ ได้ 500 = "ไม่รู้" ซึ่งถูกแล้ว)
       ของจริงที่เหลืออยู่คือ **ขาอ่านของลูกค้า** ที่นี่:
         เดิม: `try { currentUser(...) } catch { }` โดยคอมเมนต์ในวงเล็บปีกกาเขียนว่า "ไม่ได้ล็อกอิน"
         ⇒ **Blobs อ่านพลาด ถูกเรียกว่า "ไม่ได้ล็อกอิน"**
         ⇒ ลูกค้าที่มี 1,200 แต้ม เปิดหน้าแล้วเห็น **`points: 0` + ประวัติว่าง พร้อม HTTP 200**
         ⇒ อ่านได้ความเดียวว่า "แต้มฉันหายไปหมด" — ซึ่งเป็นคำกล่าวอ้างที่เป็นเท็จ ไม่ใช่การขอโทษ

       🔑 `session.mjs` **แยกสามสถานะไว้ให้แล้ว** (`currentUserState` → guest / unknown / user)
          แต่ `currentUser` ยุบ `unknown` เป็น null โดยตั้งใจ พร้อมคอมเมนต์ว่าปลอดภัยเพราะ
          "ผู้เรียกที่เหลือทุกตัวใช้ค่านี้ไป **ให้สิทธิ์น้อยลง** เท่านั้น (fail-closed)"
          ⇒ 🔴 **ข้อยกเว้นอยู่ตรงนี้** — ที่นี่ไม่ได้ลดสิทธิ์ แต่ **ประกาศตัวเลขให้ลูกค้า**
             ⇒ ไม่ใช่ fail-closed แต่เป็น **fail-with-a-false-claim** และไม่มีใครสังเกต
          ⇒ เส้นนี้จึงต้องเรียก `currentUserState` เอง ไม่ใช้ตัวที่ยุบแล้ว [[three-states-not-two]]
       ⚠️ "ไม่ได้ล็อกอิน" (guest) ยังตอบ 200 + points 0 ตามเดิม — **นั่นคือความจริงสำหรับคนนอก**
          สิ่งที่ห้ามคือเอา "อ่านไม่ได้" ไปพูดแทนความจริงนั้น */
    const สภาพ = await currentUserState(req, usersStore()).catch((err) => ({ state: "unknown", err }));
    if (สภาพ.state === "unknown")
      return json({
        ...cfg,
        อ่านไม่ได้: true,
        เหตุ: "อ่านแต้มของคุณไม่ได้ชั่วคราว — แต้มยังอยู่ครบ ไม่ได้หาย ลองใหม่อีกครั้ง",
      }, 503, { "cache-control": "no-store" });
    const me = สภาพ.state === "user" ? สภาพ.user : null;
    return json({
      ...cfg,
      points: Number(me?.points || 0),
      /* 🔴 19 ก.ย. 2569 ดึก — `log` ถูกตัดที่ 30 **แล้วส่งขึ้นจอโดยไม่บอกว่ามีทั้งหมดกี่รายการ**
         ⇒ ลูกค้าเห็น 30 บรรทัดแล้วอ่านว่า "นี่คือประวัติแต้มทั้งหมดของฉัน"
         🔑 คลาสเดียวกับที่ฝั่งจอเจอคืนนี้ (`heldBack` ตัดที่ 10 ไม่มีจำนวนเต็มไปด้วย)
            และคลาสเดียวกับที่ผมเพิ่งพลาดเอง (parse รายการที่ถูกตัดเพื่อแสดงผลแล้วเอาไปตัดสิน)
         ⇒ เพิ่ม **คีย์ใหม่** `logTotal` · **ไม่แตะคีย์เดิม** ⇒ จอสลับมาใช้เมื่อพร้อม
            (กติกาที่เราสองฝั่งตกลงกัน: ห้ามเปลี่ยนความหมายของคีย์เดิมเงียบ ๆ) */
      log: Array.isArray(me?.pointLog) ? me.pointLog.slice(0, 30) : [],
      logTotal: Array.isArray(me?.pointLog) ? me.pointLog.length : 0,
    });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // adminGate คืน { wants, ok, deny } ไม่ใช่ Response — ต้องเช็คสองชั้น
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (body.action === "settings") return json({ ok: true, ...(await writeLoyalty(body)) });

  if (body.action === "adjust") {
    const phone = normPhone(body.phone);
    const n = Math.round(Number(body.n) || 0);
    if (!phone || !n) return json({ error: "ต้องมีเบอร์ลูกค้าและจำนวนแต้ม" }, 400);
    const note = body.note || "ร้านปรับแต้มให้";
    const after = await addPoints(usersStore(), phone, n, note, null);
    if (after !== null) return json({ ok: true, points: after, pending: false });

    // ยังไม่มีบัญชีที่ใช้เบอร์นี้ — พักแต้มไว้ก่อน (ใช้ตอนย้ายแต้มลูกค้าเก่า)
    // ลูกค้าสมัคร/เข้าสู่ระบบด้วยเบอร์นี้เมื่อไหร่ แต้มจะวิ่งเข้าบัญชีเอง
    if (n < 0) return json({ error: "ไม่พบบัญชีที่ใช้เบอร์นี้ (หักแต้มไม่ได้)" }, 404);
    const held = await addPending(usersStore(), phone, n, note);
    return json({ ok: true, points: held, pending: true });
  }

  return json({ error: "ไม่รู้จักคำสั่งนี้" }, 400);
}

export const config = { path: "/api/points" };
