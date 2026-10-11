import type { Metadata } from "next";
import { notFound } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import PartsView from "@/components/PartsView";
import { PARTS_MODELS, หารุ่น, type PartsDoc } from "@/lib/parts";
import { titleSuffix } from "@/lib/shop";

// ⚠️ ตั้ง noindex ไว้ก่อนโดยตั้งใจ — ภาพลายเส้นเป็นงานของ STIHL
//    ยังไม่ได้ข้อสรุปว่าใช้เผยแพร่ได้หรือไม่ (ดูบันทึกใน src/lib/parts.ts)
//    เปลี่ยนภาพเป็นของร้านเองเมื่อไหร่ ค่อยถอด noindex บรรทัดเดียว
const ปิดการเก็บหน้า = { index: false, follow: true } as const;

export function generateStaticParams() {
  return PARTS_MODELS.map((m) => ({ model: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ model: string }>;
}): Promise<Metadata> {
  const { model } = await params;
  const m = หารุ่น(model);
  if (!m) return { title: titleSuffix("ไม่พบรุ่น"), robots: ปิดการเก็บหน้า };
  return {
    title: titleSuffix(`แผนผังอะไหล่ ${m.ชื่อ}`),
    description: `แผนผังอะไหล่เลื่อยยนต์ ${m.ชื่อ} — แตะที่ภาพเพื่อดูอะไหล่แต่ละชิ้น พร้อมรหัสอะไหล่`,
    robots: ปิดการเก็บหน้า,
  };
}

function อ่านข้อมูล(slug: string): PartsDoc | null {
  // อ่านตอน build จาก public/ — ไฟล์ชุดเดียวกับที่เบราว์เซอร์โหลดภาพ
  const f = path.join(process.cwd(), "public", "parts", `${slug}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, "utf8")) as PartsDoc;
  } catch {
    return null;
  }
}

export default async function Page({ params }: { params: Promise<{ model: string }> }) {
  const { model } = await params;
  const m = หารุ่น(model);
  const doc = m ? อ่านข้อมูล(m.slug) : null;
  // ⚠️ มีชื่อรุ่นในรายการแต่ไม่มีไฟล์ = ของหาย ต้องให้ 404 ไม่ใช่หน้าเปล่า
  if (!m || !doc) notFound();
  return <PartsView doc={doc} model={m} />;
}
