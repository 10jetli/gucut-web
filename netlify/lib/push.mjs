// แจ้งเตือนเด้งเข้ามือถือ (Web Push) — ไม่ต้องพึ่งแอปหรือบริการของใคร
//
// กุญแจ VAPID สร้างเองครั้งแรกแล้วเก็บใน Netlify Blobs
// เจ้าของร้านจึงไม่ต้องตั้งค่าอะไรเลยสักอย่าง
import { getStore } from "@netlify/blobs";
import webpush from "web-push";

const KEYS = "vapid-keys";
const SUBS = "push-subs";
/** แจ้งเตือนของ "ลูกค้า" แยกคีย์ตามเบอร์ — u/<เบอร์>
 *  ⚠️ ห้ามเก็บรวมกับ push-subs ของแอดมิน
 *     ปนกันเมื่อไหร่ = ลูกค้าได้แจ้งเตือนออเดอร์ของคนอื่น */
const userKey = (phone) => `u/${phone}`;

const store = () => getStore({ name: "gucut-push", consistency: "strong" });

export async function vapid() {
  const s = store();
  let k = await s.get(KEYS, { type: "json" }).catch(() => null);
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

export async function addSub(sub) {
  const s = store();
  const all = (await s.get(SUBS, { type: "json" }).catch(() => null)) || [];
  if (all.some((x) => x.endpoint === sub.endpoint)) return all.length;
  all.push(sub);
  await s.setJSON(SUBS, all.slice(-50));   // เผื่อแอดมินหลายเครื่อง
  return all.length;
}

export async function removeSub(endpoint) {
  const s = store();
  const all = (await s.get(SUBS, { type: "json" }).catch(() => null)) || [];
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

/** เก็บ subscription ของลูกค้าหนึ่งคน (มีได้หลายเครื่อง) */
export async function addUserSub(phone, sub) {
  if (!phone || !sub?.endpoint) return 0;
  const s = store();
  const all = (await s.get(userKey(phone), { type: "json" }).catch(() => null)) || [];
  if (all.some((x) => x.endpoint === sub.endpoint)) return all.length;
  all.push(sub);
  await s.setJSON(userKey(phone), all.slice(-5));   // เผื่อมือถือ+คอม
  return all.length;
}

export async function removeUserSub(phone, endpoint) {
  if (!phone) return;
  const s = store();
  const all = (await s.get(userKey(phone), { type: "json" }).catch(() => null)) || [];
  await s.setJSON(userKey(phone), all.filter((x) => x.endpoint !== endpoint));
}

export async function hasUserSub(phone) {
  if (!phone) return false;
  const all = await store().get(userKey(phone), { type: "json" }).catch(() => null);
  return Array.isArray(all) && all.length > 0;
}

/** ส่งแจ้งเตือนหาลูกค้าหนึ่งคน — คืนจำนวนเครื่องที่ส่งสำเร็จ */
export async function pushToUser(phone, payload) {
  if (!phone) return 0;
  await vapid();
  const s = store();
  const all = (await s.get(userKey(phone), { type: "json" }).catch(() => null)) || [];
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
    await s.setJSON(userKey(phone), all.filter((x) => !dead.includes(x.endpoint)));
  }
  return ok;
}
