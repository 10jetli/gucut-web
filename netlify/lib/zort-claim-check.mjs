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

/** ยิงพร้อมกันไม่เกิน limit ตัว · ผลเรียงตามลำดับของ items เสมอ */
export const PROBE_CONCURRENCY = 6;
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/** @param {{probe?: (path: string) => Promise<"exists"|"missing"|"unknown">}} [opts]
 *  probe ส่งเข้ามาได้เพื่อทดสอบโดยไม่ยิงเน็ต — ใช้งานจริงไม่ต้องส่ง */
export async function zortClaimCheck({ probe: probeFn = probe } = {}) {
  // ตัวควบคุม — ต้อง exists ทั้งคู่ ไม่งั้นผลทั้งรอบแปลไม่ได้
  const controls = ["Product/GetProducts", "Order/GetOrders"];
  const controlResults = await Promise.all(controls.map((c) => probeFn(c)));
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

  /* ⏱ **ยิงพร้อมกันทีละ PROBE_CONCURRENCY ตัว ไม่ใช่ทีละตัว** (แก้ 14 ก.ย. 2569)
      วัดจริงก่อนแก้: 46 ชื่อยิงเรียงกัน = 12.4–14.5 วิ (เพดานฟังก์ชัน 26 วิ) ⇒ เพิ่มอีก ~30 ชื่อ = ใกล้เพดาน
      และ ZORT ช้าขึ้นนิดเดียวก็โดนตัดกลางคำขอทั้งรอบ ⇒ ตัวตรวจตายเงียบทั้งชุด (งบเวลาเป็นของใช้ร่วมกัน)
      ⚠️ ห้ามยิงทั้งหมดพร้อมกันไม่จำกัด — ZORT อาจนับเป็นยิงรัวแล้วตอบผิดปกติ ⇒ ผลกลายเป็น unknown ทั้งแผง
      ⚠️ ลำดับผลต้องเหมือนเดิม (เรียงตามทะเบียน) ไม่งั้นรายงานสลับแถวกับชื่อ */
  const jobs = [];
  for (const row of ZORT_NO_API) {
    for (const n of namesIn(row.probe)) jobs.push({ kind: "noApi", row, endpoint: n });
  }
  for (const row of ZORT_CAN_BUT_NOT_BUILT) {
    // ในข้อความมีทั้งชื่อที่มีจริงและชื่อที่ไม่มี — สนใจเฉพาะตัวแรก (ตัวที่อ้างว่ามี)
    const first = namesIn(row.probe)[0];
    if (first) jobs.push({ kind: "can", row, endpoint: first });
  }
  const states = await mapLimit(jobs, PROBE_CONCURRENCY, (j) => probeFn(j.endpoint));
  jobs.forEach((j, i) => {
    const s = states[i];
    if (j.kind === "noApi") {
      if (s === "exists") broke.push({ what: j.row.what, endpoint: j.endpoint, at: j.row.at });
      else if (s === "unknown") unknown.push(j.endpoint);
    } else {
      if (s === "missing") gone.push({ what: j.row.what, endpoint: j.endpoint, at: j.row.at });
      else if (s === "unknown") unknown.push(j.endpoint);
    }
  });

  /* 📏 **จำนวนที่ยิงจริง — ต้องส่งออกไปทุกรอบ** (เพิ่ม 19 ก.ย. 2569)
     🔴 เหตุ: ยิงของจริงวันนี้ได้ `ok:true` พร้อมสามกองว่างเปล่า **โดยไม่มีเลขบอกว่ายิงอะไรไปเลย**
        ⇒ ผลหน้าตาเดียวกันเป๊ะระหว่าง "ยิง 60 ชื่อแล้วทุกคำกล่าวอ้างยังจริง"
          กับ "ทะเบียนว่าง/ตัวสกัดชื่อพัง ⇒ ไม่ได้ยิงอะไรเลย"
        🔑 ตัววัดต้องพิสูจน์ว่า **แตะงานจริง** ไม่ใช่แค่บอกว่าไม่เจอปัญหา
        ⇒ `probed: 0` ต้องอ่านว่า **ตะแกรงพัง** ไม่ใช่ "ไม่มีปัญหา" */
  const นับสถานะ = (v) => states.filter((x) => x === v).length;
  return {
    ok: broke.length === 0 && gone.length === 0,
    /* 🚫 ยิง 0 ชื่อ = แปลผลไม่ได้ ห้ามขึ้นเขียว (ทะเบียนว่าง · ตัวสกัดชื่อพัง · ทั้งสองหน้าตาเหมือนกัน) */
    ...(jobs.length === 0 ? { inconclusive: true, why: "ยิง 0 ชื่อ — ทะเบียนว่างหรือตัวสกัดชื่อพัง ⇒ ผลแปลไม่ได้ ไม่ใช่ 'ไม่มีปัญหา'" } : {}),
    probed: jobs.length,
    probedBreakdown: {
      "แถวในทะเบียน 'ZORT ไม่เปิด API'": ZORT_NO_API.length,
      "แถวในทะเบียน 'มีเส้นแต่เรายังไม่ทำ'": ZORT_CAN_BUT_NOT_BUILT.length,
      "ชื่อเส้นที่ยิงจากสองทะเบียนรวมกัน": jobs.length,
      exists: นับสถานะ("exists"),
      missing: นับสถานะ("missing"),
      unknown: นับสถานะ("unknown"),
      "🔑 อ่านยังไง": "ผลรวม exists+missing+unknown ต้องเท่ากับ probed · `probed: 0` = **ตะแกรงพัง ไม่ใช่ผ่าน**",
    },
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
