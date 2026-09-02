// สำรองข้อมูลอัตโนมัติทุกคืน — ตี 3 เวลาไทย (20:00 UTC)
// ตัวเนื้องานอยู่ที่ netlify/lib/backup.mjs · สั่งเดี๋ยวนั้นได้ที่ /api/core?backup=1
//
// ⚠️ งานตั้งเวลาใส่ `path` ไม่ได้ ต้องมีแต่ `schedule` — ใส่ทั้งคู่แล้วจะไม่ถูกตั้งเวลาให้
import { runBackup } from "../lib/backup.mjs";

export default async () => {
  const r = await runBackup();
  console.log("backup:", JSON.stringify(r?.totals ?? r));
  return new Response("ok");
};

export const config = { schedule: "0 20 * * *" };
