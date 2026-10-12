// แจ้งเตือนเด้งเข้ามือถือ (Web Push) — ไม่ต้องพึ่งแอปหรือบริการของใคร
//
// กุญแจ VAPID สร้างเองครั้งแรกแล้วเก็บใน Netlify Blobs
// เจ้าของร้านจึงไม่ต้องตั้งค่าอะไรเลยสักอย่าง
import { getStore } from "@netlify/blobs";
import webpush from "web-push";
import { normPhone } from "./session.mjs";

const KEYS = "vapid-keys";
const SUBS = "push-subs";
/** แจ้งเตือนของ "ลูกค้า" แยกคีย์ตามเบอร์ — u/<เบอร์>
 *  ⚠️ ห้ามเก็บรวมกับ push-subs ของแอดมิน
 *     ปนกันเมื่อไหร่ = ลูกค้าได้แจ้งเตือนออเดอร์ของคนอื่น */
// เบอร์ต้อง normalize ก่อนเสมอ — คนสมัครส่ง "063-143-8888" คนยิงส่ง "0631438888"
// ถ้า key ไม่ตรงกัน แจ้งเตือนหายเงียบ ๆ โดยไม่มี error ให้เห็น
const userKey = (phone) => `u/${normPhone(phone) || phone}`;

const store = () => getStore({ name: "gucut-push", consistency: "strong" });

export async function vapid() {
  const s = store();
  // อ่านพลาดไม่เท่ากับยังไม่เคยมีคีย์: ถ้าสร้างใหม่แล้วเขียนทับ
  // subscription ทุกเครื่องที่ผูกกับ public key เดิมจะใช้ไม่ได้พร้อมกัน
  let k = await s.get(KEYS, { type: "json" });
  if (!k?.publicKey) {
    k = webpush.generateVAPIDKeys();
    await s.setJSON(KEYS, k);
  }
  webpush.setVapidDetails("mailto:10jetli@gmail.com", k.publicKey, k.privateKey);
  return k;
}

/* 🔴 B06 ขา GET (แก้ 12 ต.ค. 2569) — ครึ่งที่เหลือหลังแก้ `vapid()` เมื่อ 14 ก.ย.
   เดิม `.catch(() => null) || []` ⇒ **"อ่านไม่ได้" กลายเป็น "ไม่มีใครสมัคร"** แล้วมีผลสองทาง:
     ① `pushToAdmins` เจอ `!all.length` ⇒ `return 0` ⇒ **แจ้งเตือนหายเงียบ**
        และ `0` นั้นแยกไม่ออกจาก "ยังไม่มีแอดมินเครื่องไหนเปิดรับ" ⇒ ไม่มีใครย้อนมาสงสัย
     ② `/api/push` method PUT ⇒ `devices: 0` ⇒ จอนับเครื่องขึ้น 0 ทั้งที่ของจริงมีเครื่องอยู่
   ⇒ โยนเมื่ออ่านไม่ได้ · `null` (ยังไม่มีคีย์) = ยังไม่มีใครสมัครจริง ⇒ `[]` ถูกต้อง
   ⚠️ **ผู้เรียกต้องไม่ปล่อยให้ throw ทะลุไปทำให้งานหลักล้ม** — แจ้งเตือนล้มห้ามทำให้ออเดอร์ล้ม
      ⇒ `pushToAdmins` ดักเองและคืน `null` = "ไม่รู้" (ดูข้างล่าง)
   📌 หน้า `/admin/status` ไม่ได้ใช้ตัวนี้ — มันอ่าน `push-subs` เองและแก้ไปแล้ว (B19 · 4 ต.ค.)
      ⇒ ตรวจแล้วว่าไม่ได้แก้ซ้ำที่เดิม */
export async function listSubs() {
  return (await store().get(SUBS, { type: "json" })) || [];
}

/* 🔴 (แก้ 14 ก.ย. 2569 · gucut2 ชี้): SUBS เป็น **ก้อนรวมของแอดมินทุกเครื่อง**
   เดิม addSub/removeSub อ่านด้วย `.catch(() => null) || []` ⇒ Blobs สะดุด = ได้ []
   ⇒ removeSub เขียน [] ทับ = **ลบการรับแจ้งเตือนของแอดมินทุกเครื่อง** · addSub ทับเหลือเครื่องเดียว
   ⇒ ทางเขียนปล่อยให้ throw เมื่ออ่านไม่ได้ (คนเรียกได้ 500 แทนที่จะลบของจริง) · null = ยังไม่มีใครสมัคร */
export async function addSub(sub) {
  const s = store();
  const all = (await s.get(SUBS, { type: "json" })) || [];
  if (all.some((x) => x.endpoint === sub.endpoint)) return all.length;
  all.push(sub);
  await s.setJSON(SUBS, all.slice(-50));   // เผื่อแอดมินหลายเครื่อง
  return all.length;
}

export async function removeSub(endpoint) {
  const s = store();
  const all = (await s.get(SUBS, { type: "json" })) || [];
  await s.setJSON(SUBS, all.filter((x) => x.endpoint !== endpoint));
}

// ส่งแจ้งเตือนหาแอดมินทุกเครื่อง — เครื่องไหนถอนสิทธิ์แล้วจะถูกลบทิ้งอัตโนมัติ
export async function pushToAdmins(payload) {
  await vapid();
  /* 🔑 คืน **`null` = "ไม่รู้ว่าส่งถึงใครบ้าง"** แยกจาก `0` = "ไม่มีเครื่องไหนเปิดรับ"
     ⇒ ห้ามโยนออกไป เพราะผู้เรียกคือ orders/chat/permit-doc ซึ่งงานหลักต้องไม่ล้มเพราะแจ้งเตือน
     ⇒ แต่ก็ห้ามคืน `0` เพราะนั่นคือคำยืนยันที่เป็นเท็จ (คลาสเดียวกับ B04 แต้ม "คุณมี 0 แต้ม") */
  let all;
  try { all = await listSubs(); }
  catch (e) {
    console.error("[push] อ่านรายชื่อเครื่องแอดมินไม่ได้ ⇒ ไม่รู้ว่าส่งถึงใคร:", String(e?.message ?? e).slice(0, 120));
    return null;
  }
  if (!all.length) return 0;
  /* 🔴 **B11 (แก้ 3 ต.ค. 2569) — เดิมคืน `all.length - dead.length` ซึ่งไม่ได้นับความสำเร็จ**
     `dead` เพิ่มเฉพาะ 404/410 ⇒ พลาดด้วย **500 · เน็ตหลุด · VAPID ไม่ตรง** ถูกนับเป็นสำเร็จ
     ⇒ `/api/push` ตอบ `{ok:true, sent:1}` ทั้งที่ไม่มีเครื่องไหนได้รับเลย
     ⇒ เจ้าของร้านกดปุ่ม "ทดสอบการแจ้งเตือน" เห็นเขียว **จึงเชื่อว่าระบบพร้อม**
       วันที่ลูกค้าทักจริงแล้วไม่เด้ง ไม่มีใครย้อนมาสงสัยปุ่มที่เคยขึ้นเขียว
     🔑 ท่าที่ถูกอยู่ในไฟล์นี้เองห่างกันสามฟังก์ชัน: `pushToUser` นับ `ok++` จาก `.then()`
        ⇒ คลาส: **สองฟังก์ชันรูปเดียวกันในไฟล์เดียวกัน นับคนละความหมาย**
          `ok` = สำเร็จจริง · `all - dead` = "ทั้งหมดลบที่เรารู้ว่าตาย" (ไม่ใช่ความสำเร็จ)
     ⚠️ **ล้มด้วยเหตุอื่นห้ามลบเครื่องทิ้ง** — 500 คือปลายทางสะดุดชั่วคราว ไม่ใช่ถอนสิทธิ์
        ลบทิ้ง = แอดมินหายจากระบบแจ้งเตือนเพราะเน็ตกระตุกครั้งเดียว */
  const dead = [];
  const พลาดเหตุอื่น = [];
  let ok = 0;
  await Promise.all(
    all.map((sub) =>
      webpush.sendNotification(sub, JSON.stringify(payload))
        .then(() => { ok++; })
        .catch((e) => {
          if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(sub.endpoint);
          else พลาดเหตุอื่น.push(`${sub.endpoint.slice(-24)}:${e?.statusCode || e?.message || "?"}`);
        })
    )
  );
  if (dead.length) {
    const s = store();
    const left = all.filter((x) => !dead.includes(x.endpoint));
    await s.setJSON(SUBS, left);
  }
  /* 🔑 **เงียบไม่ได้** — ส่งไม่ถึงสักเครื่องคือเรื่องที่ต้องมีคนรู้ ไม่ใช่เลข 0 ที่ไม่มีใครดู
     ทำได้แค่ `console` เพราะคนเรียกบางตัวไม่มีทางรายงานกลับ (เรียกแบบไม่ await) */
  if (พลาดเหตุอื่น.length) {
    console.warn(`[push] ส่งแอดมินไม่สำเร็จ ${พลาดเหตุอื่น.length}/${all.length} เครื่อง`
      + ` (ไม่ลบทิ้ง เพราะไม่ใช่ 404/410): ${พลาดเหตุอื่น.join(" · ")}`);
  }
  return ok;
}


// ---------------------------------------------------------------------------
// แจ้งเตือนหา "ลูกค้า" รายคน
//
// เจ้าของร้านสั่ง (26 ส.ค. 2569) "ต้องมีระบบแจ้งเตือนถามลูกค้า"
// เรื่องขอทะเบียนมีช่วงที่ลูกค้าหายไปจากเว็บเป็นสัปดาห์ (รอใบ ลซ.๒ ทางไปรษณีย์)
// ถ้าไม่มีอะไรตามไปเตือน เขาจะไม่กลับมากดและไม่ส่งใบให้ร้าน
//
// ⚠️ หนึ่งเบอร์ = หนึ่งคีย์ ห้ามเก็บรวมก้อนเดียวแบบของแอดมิน
//    ลูกค้าหลายคนสมัครพร้อมกันจะเขียนทับกันจนตกหล่น
//    (กติกาเดียวกับตัวนับคนเข้าเว็บและระบบลงเวลา)
// ⚠️ เครื่องที่ถอนสิทธิ์แล้วต้องลบทิ้งอัตโนมัติ ไม่งั้นยิงหาเครื่องที่ตายแล้วทุกวัน
// ---------------------------------------------------------------------------

/* 🔴 **B07 — หนึ่งเครื่อง = หนึ่งคีย์ ไม่ใช่หนึ่งเบอร์ = หนึ่งคีย์** (แก้ 18 ก.ย. 2569)
   ของเดิมกันไว้แค่ชั้นเดียว: ลูกค้าคนละคนไม่เขียนทับกัน (`u/<เบอร์>`) ✅
   แต่ **ภายในเบอร์เดียวกัน หลายเครื่องยังเก็บรวมเป็นอาร์เรย์ก้อนเดียว**
   แล้ว addUserSub ทำท่า อ่าน → แก้ → เขียนกลับ
   ⇒ ลูกค้าคนเดียวกดรับแจ้งเตือนจากมือถือกับคอมไล่กัน = **เครื่องที่เขียนช้ากว่าทับเครื่องแรก**
   ⇒ อาการที่เห็น: เครื่องอื่นหลุดจากรายชื่อ · `hasUserSub` ตอบ false ทั้งที่กดรับแล้ว
   ⇒ ไม่มี error ไม่มีอะไรฟ้อง ลูกค้าแค่ไม่ได้รับแจ้งเตือนเฉย ๆ

   🔑 ท่าที่ถูกคือท่าเดียวกับตัวนับคนเข้าเว็บ/ระบบลงเวลา: **เขียนคีย์ของตัวเอง แล้วนับคีย์**
      ไม่มีการอ่านของคนอื่นมาเขียนทับ ⇒ เขียนพร้อมกันกี่เครื่องก็ไม่ชนกัน

   ⚠️ **ของเก่าต้องอ่านได้ต่อ** — คนที่เคยกดรับไว้แล้วอยู่ในอาร์เรย์ `u/<เบอร์>`
      ถ้าอ่านเฉพาะคีย์ใหม่ = ลูกค้าเดิมเงียบไปทั้งหมดโดยไม่มีใครรู้
      ตัวอ่านจึงรวมสองแหล่งเสมอ และตัดซ้ำด้วย endpoint */
const deviceKey = (phone, endpoint) => {
  // ย่อ endpoint เป็นรหัสสั้นคงที่ — endpoint ยาวและมีอักขระที่ใช้เป็นชื่อคีย์ไม่ได้
  let h = 0n;
  for (const ch of String(endpoint)) h = (h * 131n + BigInt(ch.codePointAt(0))) % (1n << 64n);
  return `${userKey(phone)}/${h.toString(36)}`;
};

/** อ่านเครื่องทั้งหมดของเบอร์นี้ — รวมของเก่า (อาร์เรย์) กับของใหม่ (คีย์ละเครื่อง)
 *  คืน { subs, legacy } · legacy = อาร์เรย์เดิมที่ยังค้างอยู่ (ใช้ตอนต้องลบเครื่องตาย) */
async function readUserSubs(phone) {
  const s = store();
  /* 🔴 B07 ขาอ่าน (แก้ 12 ต.ค. 2569) — ทิศ "ส่งเท่าที่รู้" **ถูกแล้ว ไม่แก้**
     แต่เดิม **ไม่มีใครรู้ว่ารอบนั้นอ่านครบหรือไม่** ⇒ ผู้เรียกแยกไม่ออกระหว่าง
       "เบอร์นี้ไม่มีเครื่องเปิดรับ"  กับ  "เราอ่านรายชื่อเครื่องไม่ได้"
     ⇒ `pushToUser` คืน 0 · `hasUserSub` คืน false ⇒ **คำยืนยันที่เป็นเท็จ**
     ⇒ เพิ่มธง `ไม่ครบ` — ทางถอยยังทำงานเหมือนเดิม แต่**ประกาศตัวว่าถูกใช้**
        (กฎ fallbacks-must-announce · ทางถอยที่ไม่ประกาศตัวจะกลายเป็นทางหลักโดยไม่มีใครตัดสินใจ) */
  let ไม่ครบ = false;
  let legacy = [];
  try { legacy = (await s.get(userKey(phone), { type: "json" })) || []; }
  catch { ไม่ครบ = true; }      // อ่านอาร์เรย์เดิมไม่ได้ ⇒ เครื่องเก่าอาจหลุดจากรอบนี้
  let ใหม่ = [];
  try {
    const { blobs } = await s.list({ prefix: `${userKey(phone)}/` });
    const ผล = await Promise.all(
      (blobs || []).map((b) => s.get(b.key, { type: "json" }).then((v) => v, () => { ไม่ครบ = true; return null; })),
    );
    ใหม่ = ผล.filter((x) => x && x.endpoint);
  } catch {
    /* ⚠️ อ่านรายการคีย์ไม่ได้ = **ไม่ใช่ว่าไม่มีเครื่อง** ⇒ ยังต้องส่งให้ของเก่าตามปกติ
       ทิศของความผิดต้องไปทาง "ส่งเท่าที่รู้" ไม่ใช่ "ถือว่าไม่มีใคร" */
    ไม่ครบ = true;
  }
  const เห็นแล้ว = new Set();
  const subs = [];
  for (const x of [...ใหม่, ...(Array.isArray(legacy) ? legacy : [])]) {
    if (!x?.endpoint || เห็นแล้ว.has(x.endpoint)) continue;
    เห็นแล้ว.add(x.endpoint);
    subs.push(x);
  }
  return { subs, legacy: Array.isArray(legacy) ? legacy : [], ไม่ครบ };
}

/** เก็บ subscription ของลูกค้าหนึ่งคน (มีได้หลายเครื่อง) */
export async function addUserSub(phone, sub) {
  if (!phone || !sub?.endpoint) return 0;
  // 🔑 เขียนคีย์ของเครื่องตัวเอง ไม่แตะของเครื่องอื่น ⇒ สมัครพร้อมกันกี่เครื่องก็ไม่ชนกัน
  //    คีย์เดิมซ้ำ = เขียนทับด้วยเนื้อเดียวกัน (กดซ้ำไม่ทำให้บวม)
  await store().setJSON(deviceKey(phone, sub.endpoint), sub);
  const { subs } = await readUserSubs(phone);
  return subs.length;
}

export async function removeUserSub(phone, endpoint) {
  if (!phone) return;
  const s = store();
  // ลบทั้งสองที่: คีย์รายเครื่อง (ของใหม่) และในอาร์เรย์เดิม (ของเก่าที่ยังค้าง)
  await s.delete(deviceKey(phone, endpoint)).catch(() => {});
  /* 🔑 เดิมอ่านอาร์เรย์เดิมพลาด ⇒ ได้ `[]` ⇒ `.some()` เป็นเท็จ ⇒ **ไม่เขียนทับ (ดี)**
     แต่ก็ **ไม่ได้ลบ endpoint ออกจากอาร์เรย์เดิม และไม่มีใครรู้** ⇒ เครื่องที่ลูกค้ากดเลิกรับ
     จะยังอยู่ในรายชื่อเก่า แล้วได้แจ้งเตือนต่อไป ⇒ ลูกค้ากดเลิกแล้วยังเด้ง = เรื่องร้องเรียน
     ⇒ คืนผลให้ผู้เรียกรู้ แยก "ลบคีย์เครื่องแล้ว" ออกจาก "ตรวจรายชื่อเก่าได้หรือไม่" */
  let ตรวจของเก่าได้ = true;
  let legacy = [];
  try { legacy = (await s.get(userKey(phone), { type: "json" })) || []; }
  catch { ตรวจของเก่าได้ = false; }
  if (ตรวจของเก่าได้ && Array.isArray(legacy) && legacy.some((x) => x.endpoint === endpoint)) {
    await s.setJSON(userKey(phone), legacy.filter((x) => x.endpoint !== endpoint));
  }
  return { ลบคีย์เครื่องแล้ว: true, ตรวจของเก่าได้ };
}

/** เบอร์นี้มีเครื่องเปิดรับไหม — **คืนสามค่า** `true` · `false` · `null` (อ่านไม่ครบ ⇒ ไม่รู้)
 *  🔑 ตัวนี้ **ตอบคำถาม** ไม่ได้ลดสิทธิ์ ⇒ ยุบ "ไม่รู้" เป็น `false` ไม่ได้
 *     (เหตุผลเดียวกับที่ `/api/points` ห้ามตอบ "คุณมี 0 แต้ม" ตอนอ่านแต้มไม่ได้ · ใบ B04)
 *  ⚠️ ตอนนี้ **ยังไม่มีใครเรียกตัวนี้** — ใครจะเอาไปใช้ต้องรับมือ `null` ด้วย
 *     ห้ามเขียน `if (!(await hasUserSub(p)))` เพราะ `null` จะตกไปทาง "ไม่มีเครื่อง" ทันที */
export async function hasUserSub(phone) {
  if (!phone) return false;
  const { subs, ไม่ครบ } = await readUserSubs(phone);
  if (subs.length) return true;
  return ไม่ครบ ? null : false;
}

/** ส่งแจ้งเตือนหาลูกค้าหนึ่งคน — คืนจำนวนเครื่องที่ส่งสำเร็จ */
export async function pushToUser(phone, payload) {
  if (!phone) return 0;
  await vapid();
  const s = store();
  const { subs: all, legacy, ไม่ครบ } = await readUserSubs(phone);
  /* 🔑 `null` = ไม่รู้ว่ามีเครื่องไหม · `0` = ไม่มีเครื่องจริง — ยุบสองอย่างนี้ = แจ้งเตือนหายเงียบ
     (คลาสเดียวกับ pushToAdmins ใบ B06) · ห้ามโยน เพราะผู้เรียกคือ order-finalize/remind/zort-order */
  if (!all.length) return ไม่ครบ ? null : 0;
  if (ไม่ครบ)
    console.error(`[push] อ่านรายชื่อเครื่องของ ${phone} ไม่ครบ ⇒ จำนวนที่ส่งเป็น "อย่างน้อย" ไม่ใช่ "ทั้งหมด"`);
  const dead = [];
  let ok = 0;
  await Promise.all(
    all.map((sub) =>
      webpush.sendNotification(sub, JSON.stringify(payload))
        .then(() => { ok++; })
        .catch((e) => {
          // 404/410 = เครื่องถอนสิทธิ์หรือถอนแอปแล้ว เก็บกวาดทิ้ง
          if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(sub.endpoint);
        }),
    ),
  );
  if (dead.length) {
    // เก็บกวาดทั้งสองที่ — คีย์รายเครื่องลบทิ้ง · อาร์เรย์เดิมกรองออก
    await Promise.all(dead.map((ep) => s.delete(deviceKey(phone, ep)).catch(() => {})));
    if (legacy.some((x) => dead.includes(x.endpoint))) {
      await s.setJSON(userKey(phone), legacy.filter((x) => !dead.includes(x.endpoint)));
    }
  }
  return ok;
}
