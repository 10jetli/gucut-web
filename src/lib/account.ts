// บัญชีลูกค้า — ฝั่งหน้าเว็บ
// ตัว session เก็บใน cookie แบบ HttpOnly (JavaScript อ่านไม่ได้ = ขโมยยาก)
// หน้าเว็บจึงถาม /api/auth เอาว่าตอนนี้เป็นใคร

export interface Addr {
  name: string; phone: string; address: string; province: string; zip: string;
}
export interface User {
  phone: string; name: string; addr: Addr | null;
}

const CACHE = "gucut-user";   // จำไว้ให้หน้าโหลดแล้วไม่กระพริบ (ไม่ใช่ตัวยืนยันสิทธิ์)

export function cachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(CACHE) || "null"); } catch { return null; }
}

function remember(u: User | null) {
  if (u) localStorage.setItem(CACHE, JSON.stringify(u));
  else localStorage.removeItem(CACHE);
  window.dispatchEvent(new Event("user-changed"));
}

async function call(body: Record<string, unknown>) {
  const r = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "ระบบขัดข้อง ลองใหม่อีกครั้ง");
  return d;
}

/** ถามเซิร์ฟเวอร์ว่าตอนนี้ล็อกอินเป็นใคร */
export async function fetchMe(): Promise<User | null> {
  try {
    const r = await fetch("/api/auth", { credentials: "same-origin", cache: "no-store" });
    const d = await r.json();
    remember(d.user || null);
    return d.user || null;
  } catch {
    return cachedUser();   // เน็ตหลุด ใช้ของที่จำไว้ไปก่อน
  }
}

export async function register(phone: string, name: string, password: string) {
  const d = await call({ action: "register", phone, name, password });
  remember(d.user); return d.user as User;
}

export async function login(phone: string, password: string) {
  const d = await call({ action: "login", phone, password });
  remember(d.user); return d.user as User;
}

export async function logout() {
  await call({ action: "logout" }).catch(() => {});
  remember(null);
}

export async function saveProfile(patch: { name?: string; addr?: Addr }) {
  const d = await call({ action: "profile", ...patch });
  remember(d.user); return d.user as User;
}

export async function changePassword(old: string, next: string) {
  await call({ action: "password", old, next });
}
