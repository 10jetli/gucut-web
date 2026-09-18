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

export async function listSubs() {
  return (await store().get(SUBS, { type: "json" }).catch(() => null)) || [];
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
  const all = await listSubs();
  if (!all.length) return 0;
  const dead = [];
  await Promise.all(
    all.map((sub) =>
      webpush.sendNotification(sub, JSON.stringify(payload)).catch((e) => {
        if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(sub.endpoint);
      })
    )
  );
  if (dead.length) {
    const s = store();
    const left = all.filter((x) => !dead.includes(x.endpoint));
    await s.setJSON(SUBS, left);
  }
  return all.length - dead.length;
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
  const legacy = (await s.get(userKey(phone), { type: "json" }).catch(() => null)) || [];
  let ใหม่ = [];
  try {
    const { blobs } = await s.list({ prefix: `${userKey(phone)}/` });
    ใหม่ = (await Promise.all(
      (blobs || []).map((b) => s.get(b.key, { type: "json" }).catch(() => null)),
    )).filter((x) => x && x.endpoint);
  } catch {
    /* ⚠️ อ่านรายการคีย์ไม่ได้ = **ไม่ใช่ว่าไม่มีเครื่อง** ⇒ ยังต้องส่งให้ของเก่าตามปกติ
       ทิศของความผิดต้องไปทาง "ส่งเท่าที่รู้" ไม่ใช่ "ถือว่าไม่มีใคร" */
  }
  const เห็นแล้ว = new Set();
  const subs = [];
  for (const x of [...ใหม่, ...(Array.isArray(legacy) ? legacy : [])]) {
    if (!x?.endpoint || เห็นแล้ว.has(x.endpoint)) continue;
    เห็นแล้ว.add(x.endpoint);
    subs.push(x);
  }
  return { subs, legacy: Array.isArray(legacy) ? legacy : [] };
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
  const legacy = (await s.get(userKey(phone), { type: "json" }).catch(() => null)) || [];
  if (Array.isArray(legacy) && legacy.some((x) => x.endpoint === endpoint)) {
    await s.setJSON(userKey(phone), legacy.filter((x) => x.endpoint !== endpoint));
  }
}

export async function hasUserSub(phone) {
  if (!phone) return false;
  const { subs } = await readUserSubs(phone);
  return subs.length > 0;
}

/** ส่งแจ้งเตือนหาลูกค้าหนึ่งคน — คืนจำนวนเครื่องที่ส่งสำเร็จ */
export async function pushToUser(phone, payload) {
  if (!phone) return 0;
  await vapid();
  const s = store();
  const { subs: all, legacy } = await readUserSubs(phone);
  if (!all.length) return 0;
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
