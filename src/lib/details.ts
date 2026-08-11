// รายละเอียดเพิ่มเติมของสินค้า (ตารางสเปก · เอกสาร · ขั้นตอนขอใบอนุญาต)
// ใช้ได้เฉพาะฝั่ง server เหมือน catalog.ts
import data from "@/data/details.json";
import partInfo from "@/data/part-info.json";
import { toLocal } from "./local-images";
import type { Detail, Product } from "./types";

const raw = data as unknown as Record<string, Detail>;

export function detailOf(handle: string): Detail | undefined {
  const d = raw[handle];
  if (!d) return undefined;
  // รูปสเปกก็สลับมาใช้ของที่เก็บไว้เองถ้ามีแล้ว
  return d.specs ? { ...d, specs: d.specs.map((s) => ({ ...s, u: toLocal(s.u) as string })) } : d;
}

interface PartInfo { code?: string; fits?: string[]; pos?: string[]; size?: string[]; ref?: string[] }
const parts = partInfo as unknown as Record<string, PartInfo>;

// ตารางคุณลักษณะย่อ — สร้างจากข้อมูลที่เรามีจริง ไม่เดา
export function attrsOf(p: Product): [string, string][] {
  const out: [string, string][] = [];
  const pi = parts[p.h];
  const t = p.t.toUpperCase();
  const brand =
    t.includes("NEWWAVE") ? "NEWWAVE" :
    t.includes("KINGKONG") || t.includes("KING KONG") ? "KINGKONG" :
    t.includes("STIHL") ? "STIHL" : null;
  if (brand) out.push(["แบรนด์", brand]);
  if (p.sku) out.push(["รหัสสินค้า", p.sku.split("-")[0]]);
  if (p.v.length) out.push([p.opt || "ตัวเลือก", `${p.v.length} แบบ`]);
  if (/มีทะเบียน|ถูกต้องตามกฎหมาย|ถูกต้องตามกฏหมาย/.test(p.t))
    out.push(["เอกสาร", "ถูกต้องตามกฎหมาย ขึ้นทะเบียนได้"]);
  // ข้อมูลอะไหล่ที่แกะจากชื่อสินค้า — ลูกค้าใช้หาว่าชิ้นนี้ใส่เครื่องอะไรได้
  if (pi?.fits?.length) out.push(["ใช้กับรุ่น", pi.fits.join(" · ")]);
  if (pi?.pos?.length) out.push(["ตำแหน่งในผังอะไหล่", pi.pos.join(", ")]);
  if (pi?.size?.length) out.push(["ขนาด", pi.size.join(" · ")]);
  if (pi?.ref?.length) out.push(["เบอร์อ้างอิง", pi.ref.join(", ")]);
  if (p.cols.length) out.push(["หมวดหมู่", p.cols[0].replace(/-/g, " ")]);
  return out;
}
