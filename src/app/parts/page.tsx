import type { Metadata } from "next";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { SHELL_W } from "@/lib/layout";
import { PARTS_MODELS, type PartsDoc } from "@/lib/parts";
import { titleSuffix } from "@/lib/shop";

export const metadata: Metadata = {
  title: titleSuffix("แผนผังอะไหล่ — เลือกรุ่น"),
  description: "แผนผังอะไหล่เลื่อยยนต์ แตะที่ภาพเพื่อดูอะไหล่แต่ละชิ้นพร้อมรหัส",
  // เหตุผลที่ noindex อยู่ใน src/app/parts/[model]/page.tsx
  robots: { index: false, follow: true },
};

function นับ(slug: string) {
  const f = path.join(process.cwd(), "public", "parts", `${slug}.json`);
  if (!fs.existsSync(f)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(f, "utf8")) as PartsDoc;
    return {
      กลุ่ม: d.กลุ่ม.length,
      ชิ้น: d.กลุ่ม.reduce((n, g) => n + g.อะไหล่.length, 0),
      ปก: d.กลุ่ม[0] ? `/parts/${slug}/${d.กลุ่ม[0].ภาพ}` : null,
    };
  } catch {
    return null;
  }
}

export default function Page() {
  const รุ่น = PARTS_MODELS.map((m) => ({ ...m, ข้อมูล: นับ(m.slug) })).filter((m) => m.ข้อมูล);

  return (
    <div className={`mx-auto w-full ${SHELL_W} px-3 pb-24 pt-4`}>
      <h1 className="text-[20px] font-extrabold text-carbon">แผนผังอะไหล่</h1>
      <p className="mt-1 text-[13px] leading-relaxed text-steel-300">
        เลือกรุ่นเลื่อยของคุณ แล้วแตะที่ภาพตรงชิ้นที่ต้องการ ระบบจะบอกชื่อและรหัสอะไหล่ให้
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {รุ่น.map((m) => (
          <li key={m.slug}>
            <Link
              href={`/parts/${m.slug}/`}
              className="block overflow-hidden rounded-lg border border-steel-600 bg-white active:border-safety"
            >
              {m.ข้อมูล?.ปก && (
                // eslint-disable-next-line @next/next/no-img-element -- ภาพลายเส้นในเครื่อง ไม่ผ่าน loader R2
                <img
                  src={m.ข้อมูล.ปก}
                  alt=""
                  loading="lazy"
                  className="h-28 w-full bg-white object-contain p-2"
                />
              )}
              <div className="border-t border-steel-600 px-3 py-2.5">
                <p className="text-[15px] font-extrabold text-carbon">{m.ชื่อ}</p>
                {/* 🔖 รุ่นเทียบ — ท่านประธานเขียนกำกับบนภาพมา 19 ต.ค. 2569
                    ลูกค้าหลายคนรู้จักเครื่องในชื่อ Husqvarna/STIHL ไม่ใช่ชื่อที่ร้านตั้ง
                    ⚠️ รุ่นไหนไม่มีข้อมูลก็ไม่โชว์บรรทัดนี้ — ห้ามเดาใส่ */}
                {m.เทียบรุ่น && (
                  <p className="mt-0.5 text-[11.5px] font-medium text-safety">ใช้แทน {m.เทียบรุ่น}</p>
                )}
                <p className="mt-0.5 text-[11.5px] tabular-nums text-steel-300">
                  {m.ข้อมูล?.กลุ่ม} กลุ่ม · {m.ข้อมูล?.ชิ้น.toLocaleString("th-TH")} รายการ
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-[11.5px] leading-relaxed text-steel-300">
        หารุ่นของคุณไม่เจอ หรือไม่แน่ใจว่าเป็นชิ้นไหน — ทักร้านได้เลย ส่งรูปชิ้นที่เสียมาให้ดูก็ได้
      </p>
    </div>
  );
}
