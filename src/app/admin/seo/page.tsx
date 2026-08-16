import type { Metadata } from "next";
import Link from "next/link";
import { audit, type Level } from "@/lib/audit";

// ตรวจสุขภาพ SEO / AEO / GEO — /admin/seo/
// คิดตอน build จากข้อมูลจริงในโปรเจกต์ ไม่ต้องยิงเครื่องมือข้างนอกให้เสียเงินรายเดือน
// (จึงไม่มีปุ่ม "สแกนใหม่" — ตัวเลขอัปเดตทุกครั้งที่ deploy)
export const metadata: Metadata = {
  title: "ตรวจสุขภาพ SEO | GUCUT",
  robots: { index: false, follow: false },
};

const LOOK: Record<Level, { label: string; cls: string; dot: string }> = {
  high: { label: "ควรแก้ก่อน", cls: "text-safety", dot: "bg-safety" },
  mid:  { label: "ควรแก้",     cls: "text-[#c47f00]", dot: "bg-[#c47f00]" },
  low:  { label: "ค่อยแก้ก็ได้", cls: "text-ink-300", dot: "bg-steel-600" },
  ok:   { label: "ผ่าน",       cls: "text-[#12a150]", dot: "bg-[#12a150]" },
};

export default function Page() {
  const { findings, score, stats } = audit();

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="flex items-center gap-2 bg-ink px-3 py-3.5">
        <Link href="/admin/" aria-label="ย้อนกลับ" className="p-1 text-[20px] leading-none text-white">‹</Link>
        <span className="text-[15px] font-semibold text-white">ตรวจสุขภาพ SEO</span>
      </header>

      <div className="mx-auto max-w-lg p-3">
        {/* คะแนนรวม */}
        <section className="mb-3 rounded-sm bg-white p-5 text-center">
          <p className="text-[12px] text-ink-300">คะแนนความพร้อมของเนื้อหา</p>
          <p className={`font-heading text-[42px] font-extrabold leading-none ${score >= 80 ? "text-[#12a150]" : score >= 60 ? "text-[#c47f00]" : "text-safety"}`}>
            {score}
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-300">
            คิดจากข้อมูลจริงในเว็บ ไม่ได้เดา — ยิ่งเนื้อหาครบ Google กับผู้ช่วย AI
            ยิ่งหยิบไปตอบได้ง่าย
          </p>
        </section>

        {/* ตัวเลขรวม */}
        <section className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-sm bg-steel-700">
          {Object.entries(stats).map(([k, v]) => (
            <div key={k} className="bg-white px-3 py-2.5">
              <p className="text-[11px] text-ink-300">{k.replace(/([ก-๙])([A-Z])/g, "$1 $2")}</p>
              <p className="font-heading text-[17px] font-bold text-ink">{v.toLocaleString("th-TH")}</p>
            </div>
          ))}
        </section>

        {/* งานที่ต้องทำ */}
        <p className="mb-2 px-1 text-[13px] font-bold text-ink">งานที่ควรทำ ({findings.length} เรื่อง)</p>
        {findings.map((f) => {
          const look = LOOK[f.level];
          return (
            <section key={f.title} className="mb-2 overflow-hidden rounded-sm bg-white">
              <div className="flex items-center gap-2 border-b border-steel-700 px-3 py-2.5">
                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${look.dot}`} />
                <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-ink">{f.title}</span>
                <span className="shrink-0 font-heading text-[15px] font-bold text-ink">{f.count.toLocaleString("th-TH")}</span>
                <span className={`shrink-0 text-[11px] ${look.cls}`}>{look.label}</span>
              </div>
              <div className="space-y-1.5 px-3 py-2.5 text-[12.5px] leading-relaxed">
                <p className="text-ink-700"><span className="text-ink-300">ทำไมต้องแก้ · </span>{f.why}</p>
                <p className="text-ink-700"><span className="text-ink-300">แก้ยังไง · </span>{f.how}</p>
                {f.sample?.length ? (
                  <p className="text-[11.5px] text-ink-300">
                    ตัวอย่าง: {f.sample.map((s) => s.slice(0, 40)).join(" · ")}
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}

        <section className="mt-3 rounded-sm bg-white p-4">
          <p className="mb-2 text-[13px] font-bold text-ink">ของที่ทำครบแล้ว</p>
          <ul className="space-y-1 text-[12.5px] leading-relaxed text-ink-700">
            <li>✅ ข้อมูลโครงสร้างครบทุกหน้า (สินค้า · หมวด · บทความ · คลิป · ร้าน)</li>
            <li>✅ หน้าคำถามที่พบบ่อย พร้อม FAQPage — ตัวที่ทำให้ถูกหยิบไปตอบ</li>
            <li>✅ llms.txt + ฟีดสินค้า /products.json สำหรับผู้ช่วย AI</li>
            <li>✅ 301 จาก URL เดิมบน Shopify เตรียมไว้แล้ว</li>
            <li>✅ sitemap ครบทุกหน้า</li>
          </ul>
          <p className="mt-3 rounded-sm bg-safety-tint px-3 py-2 text-[12px] leading-relaxed text-safety">
            ⚠️ ทั้งหมดนี้ยังไม่มีผลจนกว่าจะย้ายไป gucut.com แล้วเปิด robots.txt
            — ตอนนี้ทั้งเว็บยังปิดไม่ให้ Google และ AI เข้าเก็บ
          </p>
        </section>
      </div>
    </main>
  );
}
