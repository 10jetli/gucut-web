// อ่านบัตรประชาชนด้วย AI — /api/read-id
//
// ---------------------------------------------------------------------------
// เจ้าของร้านสั่ง (25 ส.ค. 2569): "ใช้ netlify AI อ่านบัตร จะได้แม่น ๆ ยอมจ่ายเครดิต"
// ตัวอ่านในเครื่อง (tesseract) อ่านตัวหนังสือไทยจากรูปถ่ายไม่แม่นพอ
// โดยเฉพาะวันเกิดและที่อยู่ ซึ่งเป็นช่องที่ผิดแล้วเสียเที่ยว
//
// ใช้ Netlify AI Gateway — ไม่ต้องหาคีย์จากที่อื่นมาใส่
// Netlify ใส่ ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL ให้เอง แล้วคิดเป็นเครดิตของร้าน
// ($1 = 180 เครดิต · ขีดจำกัดต่อนาทีขึ้นกับแพ็กเกจ)
//
// ⚠️ ข้อแลกเปลี่ยนที่ต้องรู้ — รูปบัตร "ออกจากเครื่องลูกค้า" แล้ว
//    ของเดิมอ่านในเครื่อง 100% รูปไม่เคยไปไหน ตอนนี้รูปวิ่งผ่านเซิร์ฟเวอร์ร้าน
//    ไปที่ผู้ให้บริการ AI — เจ้าของร้านรับทราบและตัดสินใจแล้ว
//    ⇒ หน้าเว็บต้องเขียนบอกลูกค้าตรง ๆ ก่อนกดถ่าย ไม่ใช่ซ่อนไว้
//
// ⚠️ ห้ามเก็บรูปหรือข้อมูลที่อ่านได้ลงที่ไหนทั้งสิ้น
//    ไม่เขียนลง Blobs · ไม่ log · ไม่ส่งเข้า Telegram
//    รับมา → ส่งต่อ → คืนผล → ลืม  เท่านั้น
//    เลขบัตรประชาชนเป็นข้อมูลอ่อนไหวตาม PDPA เก็บไว้คือรับความเสี่ยงฟรี ๆ
//
// ⚠️ ตัวนี้เสียเงินจริงต่อการเรียกหนึ่งครั้ง ต้องมีตัวกันยิงรัวเสมอ
//    ไม่มีตัวกัน = ใครก็ยิงรูปเข้ามาเผาเครดิตร้านได้ทั้งคืน
// ---------------------------------------------------------------------------

import { getStore } from "@netlify/blobs";

const json = (o, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_IP = 12;              // ถ่ายใหม่หลายรอบเป็นเรื่องปกติ แต่ไม่ควรเกินนี้
const MAX_BYTES = 4 * 1024 * 1024;  // รูปหลังย่อในเครื่องแล้วไม่ควรเกิน 4MB

/** กันยิงรัว — หนึ่งคีย์ต่อ IP เก็บเวลาที่ยิง */
async function overLimit(ip) {
  try {
    const s = getStore({ name: "gucut-coupon", consistency: "strong" });
    const key = `rl/readid/${ip}`;
    const now = Date.now();
    const hits = ((await s.get(key, { type: "json" }).catch(() => null)) || [])
      .filter((t) => now - t < WINDOW_MS);
    if (hits.length >= MAX_PER_IP) return true;
    hits.push(now);
    await s.setJSON(key, hits).catch(() => {});
    return false;
  } catch {
    return false;   // ตัวนับพังต้องไม่ทำให้ลูกค้าใช้งานไม่ได้
  }
}

// ⚠️ สั่งให้ตอบเป็น JSON อย่างเดียว และ "ไม่รู้ให้ตอบว่าง" ห้ามเดา
//    เดาแล้วผิดอันตรายกว่าเว้นว่าง เพราะลูกค้าเอาไปรับรองต่อนายทะเบียน
const PROMPT = `อ่านข้อมูลจากรูปบัตรประจำตัวประชาชนไทยใบนี้ แล้วตอบกลับเป็น JSON เท่านั้น

{
  "name": "คำนำหน้า ชื่อ นามสกุล เช่น นาย สมชาย ใจดี",
  "idNumber": "เลข 13 หลักติดกันไม่มีขีด",
  "birth": "YYYY-MM-DD เป็นปี ค.ศ. (ถ้าบัตรเขียน พ.ศ. ให้ลบ 543)",
  "houseNo": "บ้านเลขที่ เช่น 82 หรือ 295/1",
  "moo": "หมู่ที่ เป็นตัวเลข",
  "soi": "ตรอก/ซอย",
  "road": "ถนน",
  "tambon": "ตำบลหรือแขวง ไม่ต้องมีคำว่า ต. นำหน้า",
  "amphoe": "อำเภอหรือเขต ไม่ต้องมีคำว่า อ. นำหน้า",
  "province": "จังหวัด ไม่ต้องมีคำว่า จ. นำหน้า"
}

กติกา
- ช่องไหนอ่านไม่ออกหรือไม่มีบนบัตร ให้ใส่ค่าว่าง "" ห้ามเดาเด็ดขาด
- วันเกิดต้องเป็นวันที่ข้างป้าย "เกิดวันที่" หรือ "Date of Birth" เท่านั้น
  ห้ามเอาวันออกบัตรหรือวันบัตรหมดอายุมาตอบ
- ถ้ารูปไม่ใช่บัตรประจำตัวประชาชนไทย ให้ตอบ {"notIdCard": true}
- ตอบ JSON ล้วน ไม่ต้องมีคำอธิบายหรือเครื่องหมาย code fence`;

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // ⚠️ ต้องใช้ NETLIFY_AI_GATEWAY_* เป็นตัวแรกเสมอ ห้ามเอา ANTHROPIC_API_KEY ขึ้นก่อน
  //
  //    Netlify AI Gateway "ไม่ใส่ ANTHROPIC_API_KEY/ANTHROPIC_BASE_URL ให้ ถ้ามีคนตั้งค่าไว้เองแล้ว"
  //    ร้านนี้มี ANTHROPIC_API_KEY ตั้งไว้เองอยู่ก่อน Gateway จึงเงียบไปทั้งคู่
  //    ผลคือได้คีย์ที่ตั้งไว้เองมาโดยไม่มี base url แล้วยิงไป api.anthropic.com
  //    ปลายทางตอบ invalid x-api-key — อาการหลอกตามาก ดูเหมือนคีย์เสีย ทั้งที่เป็นเรื่องคนละเรื่อง
  //    (เจอของจริง 25 ส.ค. 2569 หลังยิงทดสอบสองรอบ)
  //
  //    NETLIFY_AI_GATEWAY_KEY / _BASE_URL ถูกใส่ให้ "เสมอ" ไม่สนใจว่าใครตั้งอะไรไว้
  //    จึงเป็นทางเดียวที่ไม่พังเมื่อร้านไปตั้งคีย์ของตัวเองเพิ่มทีหลัง
  //    ⚠️ ต้อง deploy ขึ้น production อย่างน้อยหนึ่งครั้ง Gateway ถึงจะเริ่มใส่ค่าให้
  //    คิดเงินเป็นเครดิต Netlify ของร้าน — $1 = 180 เครดิต
  const gwKey = process.env.NETLIFY_AI_GATEWAY_KEY;
  const gwBase = process.env.NETLIFY_AI_GATEWAY_BASE_URL;
  const key = gwKey || process.env.ANTHROPIC_API_KEY;
  const base = (
    (gwKey ? gwBase : process.env.ANTHROPIC_BASE_URL) || "https://api.anthropic.com"
  ).replace(/\/+$/, "");
  if (!key) {
    // ⚠️ บอกให้ชัดว่าเป็นเรื่องการตั้งค่า ไม่ใช่รูปลูกค้าไม่ดี
    //    หน้าเว็บจะได้บอกลูกค้าให้กรอกเองแทนการให้ถ่ายซ้ำไปเรื่อย ๆ
    return json({ error: "ยังไม่ได้ตั้งค่าตัวอ่าน", setup: true }, 503);
  }

  const ip = req.headers.get("x-nf-client-connection-ip") || "unknown";
  if (await overLimit(ip)) {
    return json({ error: "ถ่ายบัตรถี่เกินไป พักสัก 10 นาทีแล้วลองใหม่" }, 429);
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  const b64 = String(body?.image || "").replace(/^data:image\/\w+;base64,/, "");
  if (!b64) return json({ error: "ไม่มีรูป" }, 400);
  if (b64.length * 0.75 > MAX_BYTES) return json({ error: "รูปใหญ่เกินไป" }, 413);

  const media = /^data:(image\/\w+);/.exec(String(body?.image || ""))?.[1] || "image/jpeg";

  try {
    // ⚠️ รูปแบบที่อยู่ของ NETLIFY_AI_GATEWAY_BASE_URL ไม่มีเขียนไว้ในเอกสาร
    //    บางแบบต้องต่อชื่อผู้ให้บริการเข้าไปด้วย (/anthropic) บางแบบไม่ต้อง
    //    จึงลองแบบตรง ๆ ก่อน เจอ 404 ค่อยลองแบบมีชื่อผู้ให้บริการ
    //    404 ไม่เสียเครดิต จึงถูกกว่าการเดาผิดแล้วต้อง deploy ใหม่ (deploy ละ 15 เครดิต)
    const paths = base.includes("/anthropic")
      ? ["/v1/messages"]
      : ["/v1/messages", "/anthropic/v1/messages"];

    const send = (path) => fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        authorization: `Bearer ${key}`,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        // ⚠️ ใส่ชื่อรุ่นแบบมีวันที่ ตามรายชื่อที่ Netlify AI Gateway รองรับ
        //    ชื่อย่อไม่มีวันที่ Gateway อาจไม่รู้จัก
        model: process.env.READ_ID_MODEL || "claude-sonnet-4-5-20250929",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: media, data: b64 } },
            { type: "text", text: PROMPT },
          ],
        }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    let r = await send(paths[0]);
    if (r.status === 404 && paths[1]) r = await send(paths[1]);

    const out = await r.json().catch(() => null);
    if (!r.ok) {
      // ⚠️ ต้องแยก "เครดิตหมด / ยิงเร็วเกินโควตาต่อนาที" ออกจาก "ของพัง"
      //    ถ้าเหมารวมเป็น 502 หมด หน้าเว็บจะถอยไปใช้ตัวอ่านในเครื่องเงียบ ๆ
      //    แล้วเจ้าของร้านจะไม่มีวันรู้ว่าเครดิตหมดไปตั้งแต่เมื่อไหร่
      //    รู้แต่ว่า "หลัง ๆ อ่านบัตรไม่ค่อยแม่น" ซึ่งตามหาสาเหตุไม่เจอ
      const why = out?.error?.message || `ตัวอ่านตอบ ${r.status}`;
      if (r.status === 429) return json({ error: "ตัวอ่านคิวเต็ม รอสักครู่แล้วลองใหม่", why }, 429);
      if (r.status === 402) return json({ error: "เครดิตตัวอ่านหมด", credit: true, why }, 402);
      // ⚠️ บอกแค่ "ใช้ตัวแปรไหน" กับ "โฮสต์ปลายทาง" ห้ามใส่ค่าคีย์ลงไปเด็ดขาด
      //    ชื่อตัวแปรกับชื่อโฮสต์ไม่ใช่ความลับ แต่ค่าคีย์เป็น
      //    มีไว้เพื่อแยก "คีย์ผิด" กับ "ที่อยู่ปลายทางผิด" ออกจากกันได้โดยไม่ต้อง deploy ซ้ำ
      let host = "";
      try { host = new URL(base).host; } catch { /* ที่อยู่เพี้ยนก็ปล่อยว่าง */ }
      return json({ error: why, via: gwKey ? "gateway" : "own-key", host }, 502);
    }

    const text = (out?.content || []).map((c) => c.text || "").join("").trim();
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return json({ error: "อ่านผลไม่ได้" }, 502);

    const data = JSON.parse(m[0]);
    if (data.notIdCard) return json({ error: "รูปนี้ไม่ใช่บัตรประชาชน ลองถ่ายใหม่" }, 422);

    // ⚠️ คืนเฉพาะช่องที่รู้จัก ไม่ส่งอะไรที่ AI แถมมาเองกลับไปหน้าเว็บ
    const pick = (k) => (typeof data[k] === "string" ? data[k].trim() : "");
    return json({
      name: pick("name"),
      idNumber: pick("idNumber").replace(/\D/g, "").slice(0, 13),
      birth: pick("birth"),
      houseNo: pick("houseNo"),
      moo: pick("moo"),
      soi: pick("soi"),
      road: pick("road"),
      tambon: pick("tambon"),
      amphoe: pick("amphoe"),
      province: pick("province"),
    });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 502);
  }
}

export const config = { path: "/api/read-id" };
