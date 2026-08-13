// รหัสเข้าหลังบ้าน — ที่เดียวที่ทั้งเว็บใช้ร่วมกัน
//
// รหัสจริงตั้งไว้ที่ Netlify → Environment variables → CHAT_ADMIN_KEY
// ฝั่งเว็บแค่จำรหัสไว้ในเครื่อง แล้วแนบไปกับทุกคำขอผ่าน header
// (ไม่ใส่ใน URL เด็ดขาด — URL จะไปโผล่ใน log ของ Netlify)

const KEY = "gucut-admin-key";

// เครื่องจำรหัสไว้ได้นานเท่านี้ แล้วต้องใส่ใหม่
// กันกรณีมือถือหาย/ให้คนอื่นยืม แล้วรหัสร้านค้างอยู่ในเครื่องตลอดไป
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;

export function getKey(): string {
  if (typeof window === "undefined") return "";
  const raw = localStorage.getItem(KEY);
  if (!raw) return "";
  // ของเดิมเก็บเป็นข้อความล้วน — บันทึกใหม่ให้มีวันหมดอายุ แล้วใช้ต่อได้เลย
  if (!raw.startsWith("{")) { saveKey(raw); return raw; }
  try {
    const { k, at } = JSON.parse(raw) as { k?: string; at?: number };
    if (!k || !at || Date.now() - at > MAX_AGE) { clearKey(); return ""; }
    return k;
  } catch {
    clearKey();
    return "";
  }
}

export function saveKey(k: string) {
  localStorage.setItem(KEY, JSON.stringify({ k: k.trim(), at: Date.now() }));
}

export function clearKey() {
  localStorage.removeItem(KEY);
}

/** ยิงถาม API หลังบ้านพร้อมรหัส */
export function adminFetch(path: string, key: string, init: RequestInit = {}) {
  return fetch(path, {
    ...init,
    headers: { ...(init.headers || {}), "x-admin-key": key },
  });
}

/** ตรวจรหัสกับเซิร์ฟเวอร์จริงก่อนบันทึก — กันเก็บรหัสผิดไว้แล้วมาพังทีหลัง */
export async function verifyKey(k: string): Promise<"ok" | "wrong" | "offline"> {
  try {
    const r = await adminFetch("/api/chat", k.trim());
    if (r.status === 401) return "wrong";
    if (!r.ok) return "offline";
    return "ok";
  } catch {
    return "offline";
  }
}

/** ให้หน้าไหนก็ตามที่ต้องล็อกอินเรียกใช้ — ยังไม่ล็อกอินก็ส่งไปหน้าล็อกอิน */
export function requireKey(): string {
  const k = getKey();
  if (!k && typeof window !== "undefined") {
    const back = window.location.pathname;
    window.location.replace("/admin/?next=" + encodeURIComponent(back));
  }
  return k;
}
