// ชนิดข้อมูลของแบบ ลซ.1 — ย้ายมาจาก Lz1Document.tsx ที่ถูกลบทิ้ง
//
// ⚠️ เอกสารที่วาดเองด้วย HTML ถูกลบตามคำสั่งเจ้าของร้าน (26 ส.ค. 2569)
//    "ยึดฟอร์มทางการเป็นหลัก อันเก่าลบทิ้ง" — ตัวสร้างเอกสารจริงอยู่ที่ lz1pdf.ts
//    ชนิดข้อมูลนี้ยังใช้ทั้งฟอร์มบนหน้าจอ ร่างใน localStorage และลิงก์แชร์
//    ⚠️ ห้ามลบช่องใด แม้ช่องนั้นไม่ได้ขึ้นบนจอแล้ว (อาชีพ · พื้นที่ · วัตถุประสงค์ ·
//      เขียนที่) — ร่างเก่ากับลิงก์แชร์เก่ายังมีค่าพวกนี้อยู่
export interface Lz1Data {
  writtenAt: string;
  day: string;
  month: string;
  year: string;
  name: string;
  idNumber: string;
  nationality: string;
  ethnicity: string;
  birth: string;
  age: string;
  houseNo: string;
  moo: string;
  soi: string;
  road: string;
  tambon: string;
  amphoe: string;
  province: string;
  postcode: string;
  phone: string;
  email: string;
  occupation: string;
  /** เลื่อยที่ขออนุญาต — ขอได้ทีเดียวหลายรุ่น */
  saws: { engine: string; brand: string; model: string; hp: string; bar: string; qty: string }[];
  area: string;
  purpose: string;
  /** ค่านี้คุมการติ๊กช่อง ๕.๑–๕.๑๑ บนกระดาษ — เป็น true ตายตัว (ดู PermitView) */
  qualified: boolean;
  docs: { idCopy: boolean; house: boolean; job: boolean; jobDetail: boolean };
}
