"use client";

// หัวใจ / คอมเมนต์ / บันทึกคลิป — ฝั่งเบราว์เซอร์
//
// ถูกใจ + คอมเมนต์  → เก็บที่เซิร์ฟเวอร์ (/api/social) เพราะทุกคนต้องเห็นตัวเลขเดียวกัน
// "ฉันกดไปแล้ว"     → เก็บในเครื่องลูกค้า ไม่ต้องล็อกอินก็กดได้ทันที
// บันทึกไว้ดูทีหลัง → เก็บในเครื่องล้วน ๆ ไม่ต้องส่งขึ้นเซิร์ฟเวอร์เลย
//                    (เป็นเรื่องส่วนตัวของลูกค้า ร้านไม่จำเป็นต้องรู้)

export interface VideoComment {
  i: string;    // รหัสคอมเมนต์ (ไว้ให้ร้านลบ)
  n: string;    // ชื่อคนพิมพ์
  t: string;    // ข้อความ
  at: number;   // เวลาที่พิมพ์
}

/** { "<hash คลิป>": [ยอดถูกใจ, จำนวนคอมเมนต์] } */
export type VideoCounts = Record<string, [number, number]>;

const LIKED_KEY = "gucut-liked";
const SAVED_KEY = "gucut-saved";
const NAME_KEY = "gucut-chat-name";   // ใช้ชื่อเดียวกับกล่องแชท ลูกค้าจะได้ไม่ต้องกรอกซ้ำ

const readList = (key: string): string[] => {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); } catch { return []; }
};

const writeList = (key: string, list: string[]) => {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* เต็ม ข้ามไป */ }
  window.dispatchEvent(new Event("gucut-social"));
};

// ---------------------------------------------------------------- ถูกใจ
export const likedIds = () => new Set(readList(LIKED_KEY));

/** สลับหัวใจ — คืนค่าว่าหลังกดแล้วเป็นถูกใจอยู่ไหม (อัปเดตหน้าจอได้ทันทีไม่ต้องรอเซิร์ฟเวอร์) */
export function toggleLike(id: string): boolean {
  const list = readList(LIKED_KEY);
  const on = !list.includes(id);
  writeList(LIKED_KEY, on ? [...list, id] : list.filter((x) => x !== id));
  // ยิงบอกเซิร์ฟเวอร์ทีหลัง พังก็ไม่เป็นไร หน้าจอลูกค้าถูกต้องแล้ว
  fetch("/api/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: on ? "like" : "unlike", id }),
  }).catch(() => {});
  return on;
}

// ---------------------------------------------------------------- บันทึกไว้
export const savedIds = () => readList(SAVED_KEY);

export function toggleSave(id: string): boolean {
  const list = readList(SAVED_KEY);
  const on = !list.includes(id);
  writeList(SAVED_KEY, on ? [...list, id] : list.filter((x) => x !== id));
  return on;
}

// ---------------------------------------------------------------- ชื่อคนคอมเมนต์
export const myName = () => (typeof window === "undefined" ? "" : localStorage.getItem(NAME_KEY) || "");
export const setMyName = (n: string) => localStorage.setItem(NAME_KEY, n);

// ชื่อสุ่มสำหรับคนที่ไม่กรอกชื่อ — แทนคำว่า "ลูกค้า" ที่ซ้ำกันหมด
// เก็บไว้ในเครื่องครั้งเดียว คนเดิมจึงได้ชื่อเดิมทุกครั้ง (เหมือนมีบัญชี ไม่สุ่มใหม่รัว ๆ)
const NAME_POOL = [
  "ช่างไม้", "คนสวน", "ชาวไร่", "นักเลื่อย", "พี่ช่าง", "ลุงช่าง", "มือใหม่หัดตัด",
  "สายบุกป่า", "คนรักป่า", "เกษตรกร", "ช่างตัดไม้", "คนขยัน", "นักสู้", "เจ้าถิ่น",
  "คนบ้านสวน", "ช่างเก่ง", "มือโปร", "คนจริง", "นักลุย", "ชาวเขา",
];
export function ensureName(): string {
  if (typeof window === "undefined") return "";
  const cur = localStorage.getItem(NAME_KEY);
  if (cur) return cur;
  const n = `${NAME_POOL[Math.floor(Math.random() * NAME_POOL.length)]}${Math.floor(Math.random() * 9000) + 1000}`;
  localStorage.setItem(NAME_KEY, n);
  return n;
}

// ---------------------------------------------------------------- เซิร์ฟเวอร์
export type VideoViews = Record<string, number>;

// ─── ปั้นยอดไลค์/คอมเมนต์เริ่มต้นให้คลิปดูมีชีวิต (social proof ของร้านเอง) ──────
// ⚠️ เป็นตัวเลข/คอมเมนต์ที่ร้านปั้นเอง ไม่ใช่ของลูกค้าจริง — เปิดไว้ให้คลิปไม่ดูร้าง
//    ปิดทั้งหมดได้ที่ SEED = false · คงที่ต่อคลิป (สุ่มจากรหัสคลิป) ไม่แกว่งทุกครั้งที่เปิด
const SEED = true;

// คอมเมนต์เชิงบวก/สอบถาม แนวลูกค้าร้านเลื่อยยนต์จริง
const COMMENT_POOL = [
  "เครื่องแรงดีมากครับ", "อยากได้เลย", "ราคาเท่าไหร่ครับ", "สนใจครับ", "ของแท้ไหมครับ",
  "จัดส่งทั่วไทยไหมครับ", "ใช้ดีไหมครับ", "มีรับประกันไหมครับ", "คมดีจริง ๆ", "อยากลองบ้าง",
  "สั่งยังไงครับ", "โหดมาก", "น่าใช้มากครับ", "ตัดลื่นดีจริง", "เก็บเงินปลายทางได้ไหม",
  "มีทะเบียนถูกต้องไหมครับ", "ทนดีไหมครับ", "อันนี้รุ่นอะไรครับ", "สวยครับ", "เอาไปตัดไม้ใหญ่ได้ไหม",
];

function hashId(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// สุ่มแบบมีเมล็ด (mulberry32) — รหัสคลิปเดียวกันได้ผลเดิมทุกครั้ง
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedLikes(id: string): number {
  if (!SEED) return 0;
  return 120 + (hashId(id + "L") % 780);   // 120–900
}
export function seededComments(id: string): VideoComment[] {
  if (!SEED) return [];
  const r = seeded(hashId(id + "C"));
  const n = 2 + Math.floor(r() * 6);       // 2–7 คอมเมนต์
  const out: VideoComment[] = [];
  const usedName = new Set<string>();
  for (let k = 0; k < n; k++) {
    let name = "";
    do { name = `${NAME_POOL[Math.floor(r() * NAME_POOL.length)]}${1000 + Math.floor(r() * 9000)}`; }
    while (usedName.has(name));           // ชื่อไม่ซ้ำกันในคลิปเดียว
    usedName.add(name);
    out.push({
      i: `seed-${id}-${k}`,
      n: name,
      t: COMMENT_POOL[Math.floor(r() * COMMENT_POOL.length)],
      at: Date.now() - Math.floor(r() * 6 * 86400000),   // กระจายย้อนหลัง ~6 วัน
    });
  }
  return out.sort((a, b) => a.at - b.at);
}
export const seedCommentCount = (id: string) => seededComments(id).length;
// รวมคอมเมนต์ที่ปั้น + ของลูกค้าจริง เรียงตามเวลา
export const mergeSeeded = (id: string, real: VideoComment[]): VideoComment[] =>
  [...seededComments(id), ...real].sort((a, b) => a.at - b.at);

export async function fetchCounts(): Promise<{ counts: VideoCounts; views: VideoViews }> {
  try {
    const r = await fetch("/api/social");
    if (!r.ok) return { counts: {}, views: {} };
    const j = await r.json();
    return { counts: j.counts ?? {}, views: j.views ?? {} };
  } catch {
    return { counts: {}, views: {} };   // ตัวเลขไม่ขึ้นดีกว่าฟีดพัง
  }
}

/**
 * จดว่าดูคลิปนี้แล้ว — เรียกเมื่อดูค้างนานพอเท่านั้น ไม่ใช่ทุกครั้งที่เลื่อนผ่าน
 * คนเดิมนับได้ครั้งเดียว (เซิร์ฟเวอร์เก็บเป็นหนึ่งคน = หนึ่งคีย์)
 * รหัสผู้ชมใช้ตัวเดียวกับตัวนับคนเข้าเว็บ อยู่ใน sessionStorage ไม่ใช่คุกกี้
 */
// จำว่าส่งไปแล้ว "ลึกสุด" แค่ไหน — ส่งซ้ำเฉพาะตอนดูลึกกว่าเดิมเท่านั้น
// (เลื่อนกลับมาดูใบเดิมแล้วดูจนจบ ต้องนับว่าดูจบด้วย ไม่ใช่ตัดทิ้งเพราะเคยส่งแล้ว)
const sent = new Map<string, number>();

/** ระดับความลึกที่เซิร์ฟเวอร์สนใจ — ตรงกับหมุดหมายใน netlify/lib/views.mjs */
const STEPS = [0, 0.5, 0.9];
const stepOf = (frac: number) => STEPS.filter((x) => frac >= x).length;

export function markViewed(id: string, frac = 0) {
  if (typeof window === "undefined" || !id) return;
  const step = stepOf(frac);
  if ((sent.get(id) ?? 0) >= step) return;   // ไม่ได้ดูลึกกว่าเดิม ไม่ต้องยิงซ้ำ
  sent.set(id, step);
  let vid = "";
  try {
    vid = sessionStorage.getItem("gu_vid") || "";
    if (!vid) {
      vid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem("gu_vid", vid);
    }
  } catch { return; }
  fetch("/api/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "view", id, vid, frac }),
    keepalive: true,
  }).catch(() => {});
}

export async function fetchComments(id: string): Promise<VideoComment[]> {
  try {
    const r = await fetch(`/api/social?id=${encodeURIComponent(id)}`);
    if (!r.ok) return mergeSeeded(id, []);
    return mergeSeeded(id, (await r.json()).comments ?? []);
  } catch {
    return mergeSeeded(id, []);
  }
}

export async function postComment(id: string, text: string, name: string) {
  // ไม่กรอกชื่อ = ใช้ชื่อสุ่มคงที่ของเครื่องนี้ (แทน "ลูกค้า" ที่ซ้ำกันหมด)
  const finalName = name.trim() || ensureName();
  const r = await fetch("/api/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "comment", id, text, name: finalName }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.error || "ส่งคอมเมนต์ไม่สำเร็จ ลองใหม่อีกครั้ง");
  return mergeSeeded(id, j.comments as VideoComment[]);
}

// ---------------------------------------------------------------- ตัวช่วยแสดงผล
/** 1200 → "1.2พัน" · 25000 → "2.5หมื่น" — ให้ตัวเลขใต้ปุ่มไม่ยาวจนดันปุ่มเบี้ยว */
export function shortCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}พัน`;
  if (n < 1000000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")}หมื่น`;
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, "")}ล้าน`;
}

/** เมื่อกี้ / 5 นาทีที่แล้ว / 3 ชม.ที่แล้ว / 12 ส.ค. */
export function agoLabel(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return "เมื่อกี้";
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} วันที่แล้ว`;
  return new Date(ms).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}
