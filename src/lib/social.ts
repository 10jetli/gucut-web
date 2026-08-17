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

// ---------------------------------------------------------------- เซิร์ฟเวอร์
export type VideoViews = Record<string, number>;

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
const sent = new Set<string>();
export function markViewed(id: string) {
  if (typeof window === "undefined" || !id || sent.has(id)) return;
  sent.add(id);
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
    body: JSON.stringify({ action: "view", id, vid }),
    keepalive: true,
  }).catch(() => {});
}

export async function fetchComments(id: string): Promise<VideoComment[]> {
  try {
    const r = await fetch(`/api/social?id=${encodeURIComponent(id)}`);
    if (!r.ok) return [];
    return (await r.json()).comments ?? [];
  } catch {
    return [];
  }
}

export async function postComment(id: string, text: string, name: string) {
  const r = await fetch("/api/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "comment", id, text, name }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.error || "ส่งคอมเมนต์ไม่สำเร็จ ลองใหม่อีกครั้ง");
  return j.comments as VideoComment[];
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
