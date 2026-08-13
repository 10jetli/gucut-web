// รายการคลิปทั้งหมด เสิร์ฟเป็นไฟล์นิ่ง /feed.json
// หน้าวิดีโอฝังไปแค่ 40 ใบแรก ที่เหลือมาดึงจากไฟล์นี้ตอนลูกค้าเลื่อนใกล้หมด
// แยกออกมาแบบนี้เพื่อให้หน้าเว็บเบาเสมอ ต่อให้คลิปขึ้นไปเป็นพัน ๆ ใบ
import { feedItems } from "@/lib/feed";

export const dynamic = "force-static";

export function GET() {
  return Response.json(feedItems());
}
