// คำถามที่พบบ่อย — แหล่งข้อมูลเดียวที่ทั้งเว็บใช้ร่วมกัน
//
// ใช้ที่ไหนบ้าง
//   • หน้า /faq/ (พร้อม FAQPage schema ให้ Google กับผู้ช่วย AI หยิบไปตอบ)
//   • ไฟล์ /llms-full.txt ที่ AI อ่านทีเดียวจบ
//
// ⚠️ เก็บเป็น JSON ไม่ใช่ฝังในหน้าเว็บ เพราะสคริปต์ตอน build (ไฟล์ .mjs)
//    ต้องอ่านชุดเดียวกันนี้ไปสร้าง llms-full.txt — ถ้าแยกกันเขียนสองที่ เดี๋ยวก็ไม่ตรงกัน
//
// ⚠️ ทุกคำตอบต้องเป็นเรื่องที่ร้านทำจริงเท่านั้น ห้ามแต่งตัวเลขหรือข้อกฎหมายขึ้นมาเอง
//    ถ้า AI เอาไปตอบผิด คนเดือดร้อนคือลูกค้า และความน่าเชื่อถือของร้านจะพังยาว
import raw from "@/data/faq.json";
import { BRAND } from "./shop";
import { COD_ON } from "./payment";

interface RawQa {
  q: string;
  a: string;
  codOn?: string;   // คำตอบที่ใช้แทน ถ้าเปิดเก็บเงินปลายทางอยู่
  more?: { t: string; href: string };
}

export interface Qa {
  q: string;
  a: string;
  more?: { t: string; href: string };
}

/** คำถามคำตอบที่พร้อมแสดง — แทนชื่อร้านและเลือกคำตอบให้ตรงกับช่องทางจ่ายเงินที่เปิดจริง */
export const faq: Qa[] = (raw as RawQa[]).map((x) => ({
  q: x.q.replace(/\{BRAND\}/g, BRAND.name),
  a: (COD_ON && x.codOn ? x.codOn : x.a).replace(/\{BRAND\}/g, BRAND.name),
  ...(x.more ? { more: x.more } : {}),
}));
