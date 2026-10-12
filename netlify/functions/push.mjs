// สมัคร/ยกเลิก การแจ้งเตือนเด้งเข้ามือถือ — /api/push
//   GET                       ขอกุญแจสาธารณะ (ไม่ลับ ใช้ตอนสมัคร)
//   POST   {subscription}     สมัครเครื่องแอดมิน   (ต้องมี x-admin-key)
//   DELETE {endpoint}         ยกเลิกเครื่องแอดมิน  (ต้องมี x-admin-key)
//
//   ฝั่ง "ลูกค้า" (27 ส.ค. 2569 — แจ้งสถานะออเดอร์ถึงคนที่ไม่ได้ล็อกอิน LINE)
//   POST   {customer:1, subscription, orderId?}   สมัครรับแจ้งเตือนของเบอร์ตัวเอง
//   DELETE {customer:1, endpoint, orderId?}       ยกเลิก
//   พิสูจน์ว่าเป็นเจ้าของเบอร์ด้วยทางใดทางหนึ่ง:
//   - orderId ของออเดอร์ตัวเอง (เลขสุ่มยาว รู้ได้เฉพาะคนที่เพิ่งสั่ง) → ใช้เบอร์ผู้รับในออเดอร์
//   - หรือ cookie ล็อกอิน → ใช้เบอร์ของบัญชี
//   ⚠️ ห้ามรับเบอร์ตรง ๆ จาก body เด็ดขาด — ใครก็สมัครแทนเบอร์คนอื่นแล้วดักแจ้งเตือนได้
import { getStore } from "@netlify/blobs";
import { vapid, addSub, removeSub, listSubs, pushToAdmins, addUserSub, removeUserSub } from "../lib/push.mjs";
import { adminGate } from "../lib/admin-gate.mjs";
import { currentUser, store as usersStore } from "../lib/session.mjs";

// หาเบอร์ของคนที่ขอสมัคร — คืน "" ถ้าพิสูจน์ไม่ได้
async function customerPhone(req, body) {
  if (body?.orderId) {
    const o = await getStore({ name: "gucut-orders", consistency: "strong" })
      .get(`o/${String(body.orderId)}`, { type: "json" })
      .catch(() => null);
    if (o?.customer?.phone) return o.customer.phone;
  }
  try {
    const me = await currentUser(req, usersStore());
    if (me?.user?.phone) return me.user.phone;
  } catch { /* ไม่ได้ล็อกอิน */ }
  return "";
}

export default async function handler(req, context) {
  // ขอกุญแจสาธารณะไม่ต้องใช้รหัส ตรวจก่อนเข้าด่านจะได้ไม่โดนนับครั้งที่ผิดฟรี ๆ
  if (req.method === "GET") {
    const k = await vapid();
    return json({ key: k.publicKey });
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }

  // ---------- ฝั่งลูกค้า — ไม่ใช้รหัสหลังร้าน ----------
  if (body?.customer) {
    const phone = await customerPhone(req, body);
    if (!phone) return json({ error: "ยังไม่รู้ว่าเป็นออเดอร์/บัญชีของใคร" }, 401);
    if (req.method === "POST") {
      if (!body?.subscription?.endpoint) return json({ error: "no subscription" }, 400);
      const n = await addUserSub(phone, body.subscription);
      return json({ ok: true, devices: n });
    }
    if (req.method === "DELETE") {
      if (body?.endpoint) {
        /* 🔑 แยก "ลบคีย์เครื่องแล้ว" ออกจาก "ตรวจรายชื่อเก่าได้หรือไม่"
           อ่านรายชื่อเก่าไม่ได้ ⇒ เครื่องนี้อาจยังค้างอยู่ในอาร์เรย์เดิมแล้วได้แจ้งเตือนต่อ
           ⇒ ต้องบอกลูกค้าตรง ๆ **ห้ามขึ้น ok:true เฉย ๆ** (ลูกค้ากดเลิกแล้วยังเด้ง = เรื่องร้องเรียน) */
        const ผล = await removeUserSub(phone, body.endpoint);
        if (ผล && ผล.ตรวจของเก่าได้ === false)
          return json({ ok: true, เตือน: true,
            ข้อความ: "ปิดแจ้งเตือนของเครื่องนี้แล้ว แต่ตรวจรายชื่อชุดเก่าไม่ได้ชั่วคราว — "
              + "ถ้ายังมีแจ้งเตือนเด้งอยู่ กดปิดอีกครั้งภายหลัง" });
      }
      return json({ ok: true });
    }
    return json({ error: "method not allowed" }, 405);
  }

  // ---------- ฝั่งแอดมิน ----------
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  if (req.method === "POST") {
    if (body?.test) {
      const n = await pushToAdmins({
        title: "ทดสอบการแจ้งเตือน",
        body: "ใช้งานได้แล้ว — ลูกค้าทักเมื่อไหร่จะเด้งแบบนี้",
        url: "/admin/chat/",
      });
      /* `null` = อ่านรายชื่อเครื่องไม่ได้ ⇒ **ไม่รู้ว่าส่งถึงใคร** ห้ามขึ้นเขียวว่า sent: 0
         (เจ้าของร้านกดปุ่มทดสอบแล้วเห็นเขียว จะเชื่อว่าระบบพร้อม — ตรงข้ามกับความจริง) */
      if (n === null)
        return json({ error: "อ่านรายชื่อเครื่องที่เปิดรับไม่ได้ชั่วคราว — ยังไม่รู้ว่าส่งถึงใคร ลองใหม่อีกครั้ง",
          อ่านไม่ได้: true }, 503);
      return json({ ok: true, sent: n });
    }
    if (!body?.subscription?.endpoint) return json({ error: "no subscription" }, 400);
    const n = await addSub(body.subscription);
    return json({ ok: true, devices: n });
  }

  if (req.method === "DELETE") {
    if (body?.endpoint) await removeSub(body.endpoint);
    return json({ ok: true });
  }

  if (req.method === "PUT") {
    /* 🔴 เดิม `devices: (await listSubs()).length` ⇒ อ่านพลาด = `devices: 0` พร้อม 200
       ⇒ จอนับเครื่องขึ้น 0 ทั้งที่ของจริงมีเครื่องเปิดรับอยู่ ⇒ คนไปตั้งใหม่ทั้งที่ไม่ใช่ปัญหา */
    try { return json({ devices: (await listSubs()).length }); }
    catch (e) {
      return json({ error: "อ่านรายชื่อเครื่องไม่ได้ชั่วคราว — **ยังไม่รู้ว่ามีกี่เครื่อง** (ไม่ได้แปลว่าไม่มี)",
        อ่านไม่ได้: true, เหตุ: String(e?.message ?? e).slice(0, 80) }, 503);
    }
  }
  return json({ error: "method not allowed" }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const config = { path: "/api/push" };
