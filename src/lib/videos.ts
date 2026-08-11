// รายการวิดีโอ feed แนวตั้ง (YouTube Shorts ช่อง NEWWAVE Legends)
// วิธีใส่คลิปจริง: เปิดคลิป Shorts → copy ตัวอักษรหลัง /shorts/ มาใส่ใน youtubeId
// เช่น https://youtube.com/shorts/AbCdEf12345 → youtubeId: "AbCdEf12345"

export interface VideoItem {
  youtubeId: string; // เว้นว่างไว้ = แสดงการ์ด placeholder ลิงก์ไปช่อง
  title: string;
  productHandle?: string; // สินค้าที่เกี่ยวข้อง (ลิงก์ใต้คลิป)
}

export const CHANNEL_URL = "https://www.youtube.com/@NEWWAVELegends";

export const videos: VideoItem[] = [
  {
    youtubeId: "",
    title: "ทดสอบตัดจริง NEWWAVE 7800 SUPER-S โค่นไม้ใหญ่",
    productHandle: "เลื่อยยนต์-newwave-7800-super-s",
  },
  {
    youtubeId: "",
    title: "แกะกล่อง KingKong 5800 รุ่นใหม่ปี 2025",
    productHandle: "เลื่อยยนต์-kingkong",
  },
  {
    youtubeId: "",
    title: "โซ่ Titanium 100% คมแค่ไหน? ทดสอบให้ดู",
    productHandle: "โซ่เลื่อยยนต์-ซอย-newwave-3623-3-8-ขนาดกลาง-titanium100-แบบเส้น",
  },
  {
    youtubeId: "",
    title: "F440 vs F288XP เลือกตัวไหนดี",
    productHandle: "เลื่อยยนต์-newwave-f440-มีเอกสารพร้อมขึ้นทะเบียน",
  },
  {
    youtubeId: "",
    title: "วิธีขอใบอนุญาตเลื่อยโซ่ยนต์ ลซ.1 ฉบับเข้าใจง่าย",
    productHandle: "เลื่อยยนต์-newwave-8800-super-s-28-มีเอกสารพร้อมขึ้นทะเบียน",
  },
];
