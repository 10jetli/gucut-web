// แจ้งเตือนเด้งเข้ามือถือ (Web Push) — ไม่ต้องพึ่งแอปหรือบริการของใคร
//
// กุญแจ VAPID สร้างเองครั้งแรกแล้วเก็บใน Netlify Blobs
// เจ้าของร้านจึงไม่ต้องตั้งค่าอะไรเลยสักอย่าง
import { getStore } from "@netlify/blobs";
import webpush from "web-push";

const KEYS = "vapid-keys";
const SUBS = "push-subs";

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
