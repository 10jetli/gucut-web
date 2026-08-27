// ลิงก์ที่ "พกข้อมูลไปด้วย" — สำหรับส่งไลน์ไปให้คนอื่นช่วยพิมพ์
//
// ---------------------------------------------------------------------------
// มาจากภาพร่างของเจ้าของร้าน: "สแกนเสร็จมีลิงค์ ส่งไป Line ได้ และปริ้นได้"
// ของจริงคือลูกค้ากรอกในมือถือแต่ไม่มีเครื่องปริ้น ต้องส่งให้ร้านถ่ายเอกสาร
// หรือให้ลูกหลานช่วยพิมพ์
//
// ⚠️ ข้อมูลอยู่หลัง # ของ URL โดยตั้งใจ
//    ส่วนที่อยู่หลัง # "ไม่ถูกส่งไปเซิร์ฟเวอร์" ตามมาตรฐานเว็บ
//    เซิร์ฟเวอร์ของร้านจึงไม่มีทางเห็นข้อมูลนี้ แม้ลูกค้าจะเปิดลิงก์กี่ครั้งก็ตาม
//    ถ้าเผลอใส่ไว้หลัง ? แทน ข้อมูลจะไปโผล่ใน log ของ Netlify ทุกครั้งที่เปิด
//
// ⚠️ แต่ต้องบอกลูกค้าตรง ๆ ว่าลิงก์นี้มีข้อมูลส่วนตัวอยู่ข้างใน
//    ส่งไลน์ = ข้อมูลผ่านเซิร์ฟเวอร์ของไลน์ และใครได้ลิงก์ไปก็เปิดดูได้
//    เป็นสิทธิ์ของลูกค้าที่จะเลือก แต่ต้องรู้ก่อนตัดสินใจ
//
// ⚠️ ห้ามใส่ลิงก์นี้ลงในอะไรที่ค้างอยู่ (ประวัติแชทร้าน ฐานข้อมูล ฯลฯ)
// ---------------------------------------------------------------------------

/** เข้ารหัสให้ปลอดภัยกับ URL และรองรับภาษาไทย */
function pack(obj: unknown): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unpack<T>(s: string): T | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

/** สร้างลิงก์เต็มที่พกข้อมูลไปด้วย (แบบยาว — ทางถอยเวลาเซิร์ฟเวอร์ไม่ว่าง) */
export function makeShareLink(data: unknown, origin?: string): string {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "");
  // ?openExternalBrowser=1 — ลิงก์นี้ถูกส่งทางไลน์เป็นหลัก เบราว์เซอร์ในแอป LINE
  // โหลดไฟล์ PDF ไม่ได้ (กดแล้วเงียบ — เจอจริง 27 ส.ค. 2569) พารามิเตอร์นี้เป็นของ LINE เอง
  // สั่งให้เปิดลิงก์ใน Safari/Chrome แทน · เบราว์เซอร์อื่นไม่รู้จักก็แค่เมิน ไม่มีผลอะไร
  return `${base}/permit/?openExternalBrowser=1#d=${pack(data)}`;
}

/** ลิงก์สั้น — ฝากข้อมูลกับร้านชั่วคราว 7 วัน (เจ้าของร้านสั่ง "ย่อลิ้ง" 27 ส.ค. 2569)
 *  ⚠️ ฝากไม่สำเร็จ = คืนลิงก์ยาวแบบเดิม ห้ามให้ลูกค้าติดตัน */
export async function makeShortLink(data: unknown): Promise<string> {
  try {
    const r = await fetch("/api/permit-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: data }),
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j?.code) return `${window.location.origin}/permit/?openExternalBrowser=1#p=${j.code}`;
  } catch { /* ตกไปใช้ลิงก์ยาว */ }
  return makeShareLink(data);
}

/** อ่านข้อมูลกลับจากลิงก์ — คืน null ถ้าไม่มีหรือเสีย */
export function readShareLink<T>(): T | null {
  if (typeof window === "undefined") return null;
  const m = /[#&]d=([^&]+)/.exec(window.location.hash);
  return m ? unpack<T>(m[1]) : null;
}

/** อ่านลิงก์ทุกแบบ — #p= (สั้น ไปแลกข้อมูลจากร้าน) หรือ #d= (ยาว ลิงก์เก่ายังเปิดได้)
 *  คืน { data } เมื่อได้ข้อมูล · { error } เมื่อลิงก์สั้นหมดอายุ · null เมื่อไม่มีลิงก์ */
export async function readAnyShareLink<T>(): Promise<{ data?: T; error?: string } | null> {
  if (typeof window === "undefined") return null;
  const mp = /[#&]p=([A-Za-z0-9]{4,16})/.exec(window.location.hash);
  if (mp) {
    try {
      const r = await fetch(`/api/permit-link?c=${mp[1]}`);
      const j = await r.json().catch(() => null);
      if (r.ok && j?.payload) return { data: j.payload as T };
      return { error: j?.error || "เปิดลิงก์ไม่สำเร็จ ลองใหม่อีกครั้ง" };
    } catch {
      return { error: "เปิดลิงก์ไม่สำเร็จ — เช็คสัญญาณเน็ตแล้วรีเฟรชหน้านี้" };
    }
  }
  const d = readShareLink<T>();
  return d ? { data: d } : null;
}

/**
 * ส่งลิงก์ไปไลน์
 *
 * ⚠️ ใช้ปลายทางแชร์ของไลน์ที่เปิดได้ทั้งในแอปและบนเว็บ
 *    ไม่ใช้ line://  เพราะเครื่องที่ไม่มีแอปจะขึ้นหน้าเปล่า
 */
export const lineShareUrl = (link: string, label = "แบบ ลซ.1 ที่กรอกไว้") =>
  `https://line.me/R/share?text=${encodeURIComponent(`${label} กดเปิดแล้วพิมพ์ได้เลย\n${link}`)}`;
