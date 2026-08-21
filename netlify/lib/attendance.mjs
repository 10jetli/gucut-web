// ลงเวลาพนักงาน — เก็บข้อมูลและคิดเวลาให้ /api/time
//
// ⚠️ เขตเวลาเป็นเรื่องเป็นเรื่องตายของระบบนี้
//    Netlify รันฟังก์ชันด้วยเวลา UTC ส่วนร้านอยู่ไทย (UTC+7)
//    ถ้าใช้ toISOString() ตรง ๆ พนักงานที่กดเลิกงานหลังห้าโมงเย็น
//    (= เที่ยงคืน UTC) จะถูกบันทึกเป็น "วันพรุ่งนี้" แล้ววันนั้นจะไม่มีเวลาเลิกงาน
//    ทุกที่ในไฟล์นี้จึงต้องคิดวันที่แบบไทยเท่านั้น ห้ามใช้เวลาเครื่อง
//
// ⚠️ เวลาที่บันทึกคิดจากนาฬิกาเซิร์ฟเวอร์เสมอ ไม่เชื่อเวลาที่เครื่องพนักงานส่งมา
//    ไม่งั้นแค่ปรับเวลาในมือถือก็โกงได้
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const store = () => getStore({ name: "gucut-staff", consistency: "strong" });

const CFG_KEY = "cfg";
const EMP_KEY = "emp";
const DEFAULT_CFG = { start: "08:30", end: "17:30" };

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;   // ไทย = UTC+7 (ไม่มีปรับเวลาตามฤดู)

/** วันที่แบบไทย "YYYY-MM-DD" จากเวลา epoch */
export function thaiDate(ts = Date.now()) {
  return new Date(ts + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

/** เวลาไทย "HH:MM" จากเวลา epoch */
export function thaiTime(ts) {
  return new Date(ts + TZ_OFFSET_MS).toISOString().slice(11, 16);
}

/** แปลง "YYYY-MM-DD" + "HH:MM" (เวลาไทย) กลับเป็น epoch */
export function thaiToTs(date, hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return Date.parse(`${date}T${m[1]}:${m[2]}:00.000Z`) - TZ_OFFSET_MS;
}

/** นาทีตั้งแต่เที่ยงคืนของข้อความ "HH:MM" */
const minutesOf = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// ---------------------------------------------------------------------------
// ค่าตั้งค่า + รายชื่อพนักงาน
// ---------------------------------------------------------------------------
export async function readCfg() {
  try {
    const v = await store().get(CFG_KEY, { type: "json" });
    return { ...DEFAULT_CFG, ...(v || {}) };
  } catch {
    return { ...DEFAULT_CFG };
  }
}

export async function writeCfg(input) {
  const cur = await readCfg();
  const ok = (v) => (/^\d{2}:\d{2}$/.test(String(v || "")) ? String(v) : null);
  const next = { start: ok(input?.start) ?? cur.start, end: ok(input?.end) ?? cur.end };
  await store().setJSON(CFG_KEY, next);
  return next;
}

/** รายชื่อพนักงานทั้งหมด (มี PIN ที่แฮชแล้ว — ห้ามส่งออกหน้าเว็บดิบ ๆ) */
export async function readEmp() {
  try {
    const v = await store().get(EMP_KEY, { type: "json" });
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// ⚠️ PIN 4-6 หลักเดาง่ายมาก แฮชเฉย ๆ ไม่พอ ต้องมีตัวกันเดารัวด้วย (ดู /api/time)
//    ใส่ "เกลือ" จากรหัสหลังร้าน เพื่อให้แฮชของร้านนี้ใช้ที่อื่นไม่ได้
const pinHash = (pin) =>
  createHash("sha256")
    .update(`${String(pin)}::${process.env.CHAT_ADMIN_KEY || "gucut"}`)
    .digest("hex");

const samePin = (a, b) => {
  const x = Buffer.from(String(a), "utf8");
  const y = Buffer.from(String(b), "utf8");
  if (x.length !== y.length) { timingSafeEqual(x, x); return false; }
  return timingSafeEqual(x, y);
};

/** เพิ่ม/แก้พนักงาน — ส่ง pin ว่างมาแปลว่า "ไม่เปลี่ยน PIN เดิม" */
export async function saveEmp(input) {
  const list = await readEmp();
  const name = String(input?.name ?? "").trim().slice(0, 40);
  if (!name) throw new Error("ต้องใส่ชื่อพนักงาน");

  const rawPin = String(input?.pin ?? "").replace(/\D/g, "");
  const id = String(input?.id ?? "").trim();
  const idx = id ? list.findIndex((e) => e.id === id) : -1;

  if (idx < 0 && rawPin.length < 4) throw new Error("ต้องตั้ง PIN 4-6 หลัก");
  if (rawPin && (rawPin.length < 4 || rawPin.length > 6)) throw new Error("PIN ต้องยาว 4-6 หลัก");

  // ⚠️ PIN ซ้ำกันไม่ได้ เพราะหน้าพนักงานใช้ PIN อย่างเดียวในการบอกว่าเป็นใคร
  //    ถ้าซ้ำ คนหนึ่งจะกดลงเวลาให้อีกคนโดยไม่ตั้งใจ
  if (rawPin) {
    const h = pinHash(rawPin);
    const clash = list.some((e, i) => i !== idx && e.pinHash === h);
    if (clash) throw new Error("PIN นี้มีคนใช้แล้ว ตั้งเลขอื่น");
  }

  const active = input?.active !== false;
  if (idx >= 0) {
    list[idx] = { ...list[idx], name, active, ...(rawPin ? { pinHash: pinHash(rawPin) } : {}) };
  } else {
    list.push({ id: `e${Date.now().toString(36)}`, name, active, pinHash: pinHash(rawPin) });
  }
  await store().setJSON(EMP_KEY, list);
  return list;
}

/** หาว่า PIN นี้เป็นของใคร — คืน null ถ้าไม่ตรงใครเลยหรือถูกพักงานอยู่ */
export async function findByPin(pin) {
  const raw = String(pin ?? "").replace(/\D/g, "");
  if (raw.length < 4) return null;
  const h = pinHash(raw);
  const list = await readEmp();
  return list.find((e) => e.active !== false && e.pinHash && samePin(e.pinHash, h)) || null;
}

// ---------------------------------------------------------------------------
// การลงเวลา
//
// ⚠️ หนึ่งคน–หนึ่งวัน = หนึ่งคีย์ (`d/<วันที่>/<รหัสพนักงาน>`)
//    ห้ามเก็บรวมเป็นก้อนเดียวแล้วอ่าน-แก้-เขียนกลับ เพราะพนักงานหลายคน
//    กดพร้อมกันตอนเปิดร้านได้ แล้วเวลาของบางคนจะหายไปเงียบ ๆ
//    (กติกาเดียวกับตัวนับคนเข้าเว็บและยอดวิวคลิป)
// ---------------------------------------------------------------------------
const dayKey = (date, id) => `d/${date}/${id}`;

/** สายกี่นาที (0 = ไม่สาย) */
function lateMinutes(inTs, date, cfg) {
  const startM = minutesOf(cfg.start);
  if (startM == null) return 0;
  const inM = minutesOf(thaiTime(inTs));
  if (inM == null) return 0;
  return Math.max(0, inM - startM);
}

/**
 * กดลงเวลา — ครั้งแรกของวันคือเข้างาน ครั้งถัดไปคือเลิกงาน (กดซ้ำอัปเดตเวลาเลิก)
 * @param peek true = ดูสถานะเฉย ๆ ไม่บันทึกอะไร
 */
export async function punch(emp, { peek = false } = {}) {
  const cfg = await readCfg();
  const now = Date.now();
  const date = thaiDate(now);
  const key = dayKey(date, emp.id);
  const s = store();

  let rec = (await s.get(key, { type: "json" }).catch(() => null)) || null;

  if (!peek) {
    if (!rec?.in) {
      rec = { name: emp.name, in: now, out: null, late: 0 };
      rec.late = lateMinutes(now, date, cfg);
    } else {
      // ⚠️ กดซ้ำ = อัปเดตเวลาเลิกงานเป็นครั้งล่าสุด ไม่ใช่สร้างรอบใหม่
      //    พนักงานมักกดซ้ำเพราะไม่แน่ใจว่ากดติดหรือยัง
      rec.out = now;
    }
    await s.setJSON(key, rec);
  }

  return {
    name: emp.name,
    in: rec?.in ? thaiTime(rec.in) : null,
    out: rec?.out ? thaiTime(rec.out) : null,
    late: rec?.late || 0,
    workStart: cfg.start,
  };
}

/** แก้เวลาย้อนหลัง — in ว่าง = ลบทั้งวันนั้นของคนนั้น */
export async function editDay({ date, id, in: tIn, out: tOut }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error("วันที่ไม่ถูกต้อง");
  const list = await readEmp();
  const emp = list.find((e) => e.id === id);
  if (!emp) throw new Error("ไม่พบพนักงานคนนี้");

  const s = store();
  const key = dayKey(date, id);

  if (!String(tIn || "").trim()) {
    await s.delete(key).catch(() => {});
    return true;
  }

  const inTs = thaiToTs(date, tIn);
  if (inTs == null) throw new Error("เวลาเข้างานต้องเป็นรูปแบบ 09:00");
  let outTs = null;
  if (String(tOut || "").trim()) {
    outTs = thaiToTs(date, tOut);
    if (outTs == null) throw new Error("เวลาเลิกงานต้องเป็นรูปแบบ 18:00");
    // ⚠️ เลิกงานข้ามเที่ยงคืนได้ (กะดึก) — ถ้าเลขน้อยกว่าเวลาเข้า ให้บวกไปอีกวัน
    if (outTs <= inTs) outTs += 24 * 60 * 60 * 1000;
  }

  const cfg = await readCfg();
  await s.setJSON(key, {
    name: emp.name,
    in: inTs,
    out: outTs,
    late: lateMinutes(inTs, date, cfg),
    edited: true,        // ติดธงไว้ให้รู้ว่าไม่ได้มาจากการกดจริง
  });
  return true;
}

/** ตารางทั้งเดือน — { "YYYY-MM-DD": { "<รหัสพนักงาน>": rec } } */
export async function monthTable(month) {
  const s = store();
  const days = {};
  try {
    const { blobs } = await s.list({ prefix: `d/${month}` });
    for (const b of blobs) {
      const [, date, id] = b.key.split("/");
      const rec = await s.get(b.key, { type: "json" }).catch(() => null);
      if (!rec) continue;
      (days[date] ||= {})[id] = rec;
    }
  } catch {
    /* ยังไม่มีข้อมูลเดือนนี้ */
  }
  return days;
}

/** รายชื่อพนักงานแบบที่ส่งออกหน้าเว็บได้ — ไม่มีแฮช PIN ติดไป */
export const publicEmp = (list) =>
  list.map((e) => ({ id: e.id, name: e.name, pin: "", active: e.active !== false }));
