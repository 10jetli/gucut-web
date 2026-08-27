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
      if (body?.endpoint) await removeUserSub(phone, body.endpoint);
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

  if (req.method === "PUT") return json({ devices: (await listSubs()).length });
  return json({ error: "method not allowed" }, 405);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export const config = { path: "/api/push" };
