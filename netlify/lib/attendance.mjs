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
const DEFAULT_CFG = { start: "08:30", end: "17:30", photo: false, gps: false, lat: 0, lng: 0, radius: 200 };

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
  const num = (v, lo, hi, def) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : def;
  };
  const next = {
    start: ok(input?.start) ?? cur.start,
    end: ok(input?.end) ?? cur.end,
    photo: input?.photo === undefined ? cur.photo : !!input.photo,
    gps: input?.gps === undefined ? cur.gps : !!input.gps,
    lat: input?.lat === undefined ? cur.lat : num(input.lat, -90, 90, cur.lat),
    lng: input?.lng === undefined ? cur.lng : num(input.lng, -180, 180, cur.lng),
    // ⚠️ ต่ำกว่า 50 เมตรใช้ไม่ได้จริง — GPS ในอาคารเพี้ยนได้ 30-100 เมตรเป็นปกติ
    radius: input?.radius === undefined ? cur.radius : num(input.radius, 50, 5000, cur.radius),
  };
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
/**
 * ระยะห่างสองพิกัดเป็นเมตร (สูตร haversine)
 * ⚠️ อย่าคิดง่าย ๆ ด้วยผลต่างองศาแล้วคูณ — ที่ละติจูดไทย 1 องศาลองจิจูด
 *    สั้นกว่า 1 องศาละติจูดราว 3% ระยะจะเพี้ยนจนตั้งรัศมีไม่ได้
 */
export function metersBetween(a, b) {
  const R = 6371000;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export async function punch(emp, { peek = false, photo = null, loc = null } = {}) {
  const cfg = await readCfg();
  const now = Date.now();
  const date = thaiDate(now);
  const key = dayKey(date, emp.id);
  const s = store();

  let rec = (await s.get(key, { type: "json" }).catch(() => null)) || null;

  // ระยะห่างจากร้าน — คิดไว้ก่อนเพื่อติดธง แต่ "ไม่บล็อกการลงเวลา"
  //
  // ⚠️ ห้ามบล็อกเด็ดขาด GPS ในอาคารเพี้ยนได้ 30-100 เมตรเป็นเรื่องปกติ
  //    และบางเครื่องไม่ให้สิทธิ์ตำแหน่งเลย ถ้าบล็อก = พนักงานที่มาทำงานจริงลงเวลาไม่ได้
  //    หน้าที่ของมันคือ "ชี้ให้ดู" ไม่ใช่ "ตัดสิน"
  let far = 0;
  if (cfg.gps && cfg.lat && cfg.lng && loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
    const d = metersBetween({ lat: cfg.lat, lng: cfg.lng }, loc);
    if (d > cfg.radius) far = d;
  }

  if (!peek) {
    if (!rec?.in) {
      rec = { name: emp.name, in: now, out: null, late: 0 };
      rec.late = lateMinutes(now, date, cfg);
      if (photo && (await savePhoto(date, emp.id, "in", photo))) rec.photoIn = true;
      if (far) rec.farIn = far;
    } else {
      // ⚠️ กดซ้ำ = อัปเดตเวลาเลิกงานเป็นครั้งล่าสุด ไม่ใช่สร้างรอบใหม่
      //    พนักงานมักกดซ้ำเพราะไม่แน่ใจว่ากดติดหรือยัง
      rec.out = now;
      if (photo && (await savePhoto(date, emp.id, "out", photo))) rec.photoOut = true;
      if (far) rec.farOut = far;
    }
    await s.setJSON(key, rec);
  }

  return {
    name: emp.name,
    in: rec?.in ? thaiTime(rec.in) : null,
    out: rec?.out ? thaiTime(rec.out) : null,
    late: rec?.late || 0,
    workStart: cfg.start,
    far,
    // บอกหน้าเว็บว่าเพิ่งบันทึกอะไรไป ไว้ใช้ตัดสินใจว่าจะเตือนร้านไหม
    kind: peek ? "peek" : rec?.out ? "out" : "in",
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


// ---------------------------------------------------------------------------
// รูปตอนลงเวลา — กัน "ฝากเพื่อนกดให้"
//
// ⚠️ รูปไม่ได้ "กัน" การโกงด้วยตัวเอง มันแค่ทำให้โกงแล้วมีหลักฐาน
//    ค่าของมันคือคนรู้ว่ามีกล้อง เลยไม่ทำ — และเวลาสงสัยขึ้นมาก็ย้อนดูได้
//
// ⚠️ เก็บเป็นไฟล์แยกคีย์ละใบ (`ph/<วันที่>/<คนไหน>/<in|out>`)
//    ห้ามยัดรูป base64 ลงในบันทึกรายวัน — ตารางทั้งเดือนต้องอ่านทุกใบ
//    จะกลายเป็นโหลดรูปเป็นสิบเมกทุกครั้งที่เปิดหน้า
//
// ⚠️ รูปคนเป็นข้อมูลส่วนบุคคลตาม PDPA — หน้าพนักงานจึงต้องเขียนบอกให้เห็นชัด
//    ว่ากำลังถ่าย และเปิด/ปิดได้จากหลังร้าน (ค่าเริ่มต้นคือปิด)
const photoKey = (date, id, kind) => `ph/${date}/${id}/${kind}`;

/** เก็บรูป (รับ data URL จากหน้าเว็บ) — คืน true ถ้าเก็บสำเร็จ */
export async function savePhoto(date, id, kind, dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ""));
  if (!m) return false;
  const buf = Buffer.from(m[2], "base64");
  // ⚠️ เพดานขนาด — หน้าเว็บย่อมาให้แล้ว แต่ถ้ามีใครยิงตรงมาต้องไม่ให้ถมพื้นที่เก็บได้
  if (!buf.length || buf.length > 400 * 1024) return false;
  try {
    await store().set(photoKey(date, id, kind), buf, {
      metadata: { type: `image/${m[1] === "png" ? "png" : m[1]}` },
    });
    return true;
  } catch {
    return false;
  }
}

/** อ่านรูปกลับมา — คืน null ถ้าไม่มี */
export async function getPhoto(date, id, kind) {
  try {
    const r = await store().getWithMetadata(photoKey(date, id, kind), { type: "arrayBuffer" });
    if (!r?.data) return null;
    return { data: r.data, type: String(r.metadata?.type || "image/jpeg") };
  } catch {
    return null;
  }
}
