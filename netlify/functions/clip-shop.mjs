// ผูกสินค้าเข้ากับคลิปในฟีดวิดีโอ — /api/clip-shop
//
// ทำไมต้องมี: คลิปที่ Shopify ผูกสินค้าไว้ให้เกือบทั้งหมดเป็นรูปอะไหล่นิ่ง ๆ
// ซึ่งถูกคัดออกจากฟีดไปแล้ว ฟีดจึงเหลือคลิปที่กดซื้อได้ใบเดียว
// หน้านี้ให้ร้านผูกสินค้าเข้ากับ "คลิปคนเลื่อยไม้จริง" ได้เอง โดยไม่ต้องแก้โค้ด
//
//   GET  /api/clip-shop                        รายการที่ผูกไว้ทั้งหมด (ฟีดของลูกค้าเรียกตัวนี้)
//   POST /api/clip-shop {clip, product}        ผูก (ต้องมีรหัสหลังร้าน)
//   POST /api/clip-shop {clip, product:null}   เอาออก
//
// เก็บสินค้าแบบ "คัดลอกข้อมูลที่ต้องใช้มาไว้เลย" (ชื่อ ราคา รูป) ไม่ใช่เก็บแค่ handle
// เพราะฟีดฝั่งลูกค้าไม่มีแคตตาล็อกอยู่ในมือ (ไฟล์ 4MB ห้ามส่งไปให้เบราว์เซอร์)
import { getStore } from "@netlify/blobs";
import { adminGate } from "../lib/admin-gate.mjs";

const KEY = "clip-shop";

const json = (o, s = 200, headers = {}) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", ...headers },
  });

const clean = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const store = () => getStore({ name: "gucut-clips", consistency: "strong" });

export default async function handler(req, context) {
  let s;
  try { s = store(); } catch { return json({ error: "store unavailable" }, 503); }

  const read = async () => (await s.get(KEY, { type: "json" }).catch(() => null)) || {};

  if (req.method === "GET") {
    return json({ map: await read() }, 200, {
      "cache-control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
    });
  }

  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // adminGate คืน { wants, ok, deny } ไม่ใช่ Response — ต้องเช็คสองชั้น
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return json({ error: "unauthorized" }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const clip = clean(body.clip, 64);
  if (!clip) return json({ error: "ไม่รู้ว่าคลิปไหน" }, 400);

  const map = await read();

  if (!body.product) {
    delete map[clip];
  } else {
    const p = body.product;
    const h = clean(p.h, 200);
    if (!h) return json({ error: "ไม่รู้ว่าสินค้าตัวไหน" }, 400);
    map[clip] = {
      h,
      t: clean(p.t, 200),
      p: Number(p.p) || 0,
      img: clean(p.img, 300) || null,
    };
  }

  await s.setJSON(KEY, map);
  return json({ ok: true, count: Object.keys(map).length });
}

export const config = { path: "/api/clip-shop" };
