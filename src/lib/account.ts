// บัญชีลูกค้า — ฝั่งหน้าเว็บ
// ตัว session เก็บใน cookie แบบ HttpOnly (JavaScript อ่านไม่ได้ = ขโมยยาก)
// หน้าเว็บจึงถาม /api/auth เอาว่าตอนนี้เป็นใคร

export interface Addr {
  name: string; phone: string; address: string; province: string; zip: string;
}
/** ชื่อเจ้าของบัญชีภายนอกที่รองรับ */
export type Provider = "line" | "facebook" | "google";

export interface User {
  phone: string; name: string; addr: Addr | null;
  /** ผูกกับบัญชีภายนอกเจ้าไหนไว้บ้าง */
  social?: Partial<Record<Provider, { name: string; picture: string }>>;
  /** บัญชีที่มาจากบัญชีภายนอกล้วน ๆ จะยังไม่มีรหัสผ่าน */
  hasPassword?: boolean;
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
  if (!r.ok) {
    const e = new Error(d.error || "ระบบขัดข้อง ลองใหม่อีกครั้ง") as Error & { status?: number };
    e.status = r.status;
    throw e;
  }
  return d;
}

/** ถามเซิร์ฟเวอร์ว่าตอนนี้ล็อกอินเป็นใคร
 *
 * 🔴 **B26 (แก้ 4 ต.ค. 2569)** — ของเดิมอ่าน `d.user` โดย **ไม่ดู `r.ok`**
 *    ⇒ `/api/auth` ที่ตอบ 503 (ที่เก็บข้อมูลสมาชิกอ่านไม่ได้) ยังแกะ JSON ได้ปกติ
 *    ⇒ `d.user` ไม่มี ⇒ `remember(null)` ⇒ **ลบของที่จำไว้ + ยิง user-changed**
 *    ⇒ หัวเว็บเปลี่ยนเป็นคนนอกให้ลูกค้าเห็น ๆ ทั้งที่ cookie ยังอยู่ครบ
 *    🔑 "ถามไม่ได้" ต้องเดินทางเดียวกับ "เน็ตหลุด" (ใช้ของที่จำไว้) —
 *       ไม่ใช่ทางเดียวกับ "ถามแล้ว ไม่มีใครล็อกอิน" (ซึ่งต้องล้างของที่จำไว้) */
export async function fetchMe(): Promise<User | null> {
  try {
    const r = await fetch("/api/auth", { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) return cachedUser();   // ถามไม่ได้ ≠ ไม่มีใครล็อกอิน — ห้ามล้างของที่จำไว้
    const d = await r.json();
    remember(d.user || null);
    return d.user || null;
  } catch {
    return cachedUser();   // เน็ตหลุด ใช้ของที่จำไว้ไปก่อน
  }
}

// keep = ติ๊ก "จดจำการเข้าสู่ระบบ" → cookie อยู่ 90 วัน
// ไม่ติ๊ก → cookie หายตอนปิดเบราว์เซอร์ (เหมาะกับเครื่องที่ใช้ร่วมกัน)
export async function register(phone: string, name: string, password: string, keep = true) {
  const d = await call({ action: "register", phone, name, password, remember: keep });
  remember(d.user); return d.user as User;
}

export async function login(phone: string, password: string, keep = true) {
  const d = await call({ action: "login", phone, password, remember: keep });
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

/* ---------- เข้าสู่ระบบด้วยบัญชีภายนอก (LINE / Facebook) ---------- */

export interface PendingSocial {
  provider: Provider;
  /** ชื่อที่เอาไปแสดง เช่น "LINE" / "Facebook" */
  label: string;
  name: string;
  picture: string;
}

/** หลังกลับจากเจ้าของบัญชี — ถามว่ามีบัญชีรอผูกเบอร์อยู่ไหม */
export async function pendingSocial(): Promise<PendingSocial | null> {
  try {
    const r = await fetch("/api/auth?pending=1", { credentials: "same-origin", cache: "no-store" });
    const d = await r.json();
    return d.pending || null;
  } catch {
    return null;
  }
}

/**
 * ผูกบัญชีภายนอกเข้ากับเบอร์โทร
 * ถ้าเบอร์นั้นมีบัญชีเดิมที่ตั้งรหัสผ่านไว้ จะโยน error ที่ needsPassword() จับได้
 * ให้ถามรหัสผ่านแล้วเรียกซ้ำ — กันคนอื่นสวมเบอร์เรา
 */
export async function linkSocial(phone: string, password?: string, keep = true) {
  const d = await call({ action: "social-link", phone, password, remember: keep });
  remember(d.user); return d.user as User;
}

export const needsPassword = (e: unknown) =>
  e instanceof Error && (e as Error & { status?: number }).status === 428;
