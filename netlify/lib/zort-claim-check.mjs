// ตรวจว่า "คำกล่าวอ้างเรื่องความสามารถของ ZORT" ที่เขียนไว้ในโค้ด **ยังจริงอยู่ไหม**
//
// ⚠️ นี่คือ **ชั้นที่สาม** และเป็นชั้นเดียวที่ตรวจ "โลกข้างนอก" (ฝั่งจอเสนอ 6 ก.ย. 2569)
//    ชั้น 1 (ตัวตรวจฝั่งจอ) กับชั้น 2 (check-claims ที่บังคับให้ทุกคำกล่าวอ้างมีวันที่)
//    ตรวจได้แค่ว่า **เราเขียนอะไรไว้** · ชั้นนี้ตรวจว่า **ที่เขียนไว้ยังตรงกับความจริงไหม**
//
// 🔴 **ทำไมต้องมี** — 6 ก.ย. 2569 วันเดียว คำกล่าวอ้าง "ZORT ไม่เปิด API ให้…" กลายเป็นเท็จ
//    อย่างน้อย 4 จุด เพราะเราเคยยิงตรวจด้วยชื่อรูปแบบเดียว · ZORT เพิ่ม/เปลี่ยนเส้นได้ทุกเมื่อ
//    โดยไม่บอกใคร ⇒ ข้อความในโค้ดจะค่อย ๆ กลายเป็นของเก่าที่ **ยังดูน่าเชื่อถือ**
//
// ⚠️ **ห้ามเอาไปใส่ prebuild** — ยิงของนอกบ้านตอน build = วันที่ ZORT ล่ม เว็บ deploy ไม่ได้
//    กติกาของโปรเจกต์: ของนอกบ้านห้ามทำให้ build ตก
// ⚠️ **ต้องมีตัวควบคุมเสมอ** — ตัวควบคุมไม่ผ่าน = ผลทั้งรอบแปลไม่ได้ ต้องตอบ inconclusive
//    ไม่ใช่รายงานว่า "ทุกอย่างยังจริง" (ซึ่งจะเป็นเขียวหลอกในวันที่คีย์หมดอายุ)
import { ZORT_NO_API, ZORT_CAN_BUT_NOT_BUILT, ZORT_PROBE_METHOD } from "./zort-write.mjs";

const BASE = "https://open-api.zortout.com/v4";

/** ดึงชื่อเส้นออกจากข้อความ probe (เช่น "Agent/GetAgents → 404") */
const namesIn = (s) => [...String(s ?? "").matchAll(/\b([A-Z][A-Za-z]+\/[A-Za-z_]+)/g)].map((m) => m[1]);

/** ยิงเปล่า ๆ ไม่ใส่คีย์ — ไม่สร้างข้อมูลอะไรเลย
 *  คืน "exists" | "missing" | "unknown"  ⚠️ สามสถานะ ไม่ใช่สอง */
async function probe(path) {
  let r;
  try {
    r = await fetch(`${BASE}/${path}?limit=1`, { signal: AbortSignal.timeout(8000) });
  } catch {
    return "unknown"; // ยิงไม่ถึง ≠ ไม่มีเส้น
  }
  if (r.status === 404) return "missing";
  if (r.status === 405) return "exists"; // ผิด method = เส้นมีจริง
  const t = await r.text().catch(() => "");
  if (/resCode/i.test(t)) return "exists";
  return "unknown";
}

export async function zortClaimCheck() {
  // ตัวควบคุม — ต้อง exists ทั้งคู่ ไม่งั้นผลทั้งรอบแปลไม่ได้
  const controls = ["Product/GetProducts", "Order/GetOrders"];
  const controlResults = await Promise.all(controls.map(probe));
  if (controlResults.some((x) => x !== "exists")) {
    return {
      inconclusive: true,
      why: "ตัวควบคุมไม่ผ่าน — ยิง ZORT ไม่ได้รอบนี้ ผลทั้งชุดแปลไม่ได้ (ไม่ได้แปลว่าคำกล่าวอ้างยังจริง)",
      controls: Object.fromEntries(controls.map((c, i) => [c, controlResults[i]])),
    };
  }

  const broke = [];   // เคยบอกว่าไม่มี แต่ตอนนี้มี ⇒ คำกล่าวอ้างกลายเป็นเท็จ
  const gone = [];    // เคยบอกว่ามี แต่ตอนนี้ไม่มี ⇒ ของที่เราวางแผนจะใช้หายไป
  const unknown = []; // ยิงไม่ถึง — ต้องบอก ไม่ใช่กลืน

  for (const row of ZORT_NO_API) {
    for (const n of namesIn(row.probe)) {
      const s = await probe(n);
      if (s === "exists") broke.push({ what: row.what, endpoint: n, at: row.at });
      else if (s === "unknown") unknown.push(n);
    }
  }
  for (const row of ZORT_CAN_BUT_NOT_BUILT) {
    // ในข้อความมีทั้งชื่อที่มีจริงและชื่อที่ไม่มี — สนใจเฉพาะตัวแรก (ตัวที่อ้างว่ามี)
    const first = namesIn(row.probe)[0];
    if (!first) continue;
    const s = await probe(first);
    if (s === "missing") gone.push({ what: row.what, endpoint: first, at: row.at });
    else if (s === "unknown") unknown.push(first);
  }

  return {
    ok: broke.length === 0 && gone.length === 0,
    checkedAt: new Date().toISOString(),
    method: ZORT_PROBE_METHOD,
    /* ⚠️ ไม่ว่าง = **ข้อความในโค้ดกลายเป็นเท็จแล้ว** ต้องไปแก้ ไม่ใช่แค่รับทราบ
        และต้องไล่หาจอที่พิมพ์เหตุผลนั้นไว้ด้วย (ความรู้ใหม่ 1 ก้อน = ไล่ล่าข้อความเก่า) */
    claimsNowFalse: broke,
    capabilitiesGone: gone,
    unknown: [...new Set(unknown)],
    note: "broke = เคยบอกว่าไม่มีแต่ตอนนี้มี · gone = เคยบอกว่ามีแต่ตอนนี้ไม่มี",
  };
}
