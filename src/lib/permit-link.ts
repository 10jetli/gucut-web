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

/** สร้างลิงก์เต็มที่พกข้อมูลไปด้วย */
export function makeShareLink(data: unknown, origin?: string): string {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/permit/#d=${pack(data)}`;
}

/** อ่านข้อมูลกลับจากลิงก์ — คืน null ถ้าไม่มีหรือเสีย */
export function readShareLink<T>(): T | null {
  if (typeof window === "undefined") return null;
  const m = /[#&]d=([^&]+)/.exec(window.location.hash);
  return m ? unpack<T>(m[1]) : null;
}

/**
 * ส่งลิงก์ไปไลน์
 *
 * ⚠️ ใช้ปลายทางแชร์ของไลน์ที่เปิดได้ทั้งในแอปและบนเว็บ
 *    ไม่ใช้ line://  เพราะเครื่องที่ไม่มีแอปจะขึ้นหน้าเปล่า
 */
export const lineShareUrl = (link: string) =>
  `https://line.me/R/share?text=${encodeURIComponent(`แบบ ลซ.1 ที่กรอกไว้ กดเปิดแล้วพิมพ์ได้เลย\n${link}`)}`;
