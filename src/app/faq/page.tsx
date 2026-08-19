import type { Metadata } from "next";
import { BRAND, titleSuffix } from "@/lib/shop";
import Link from "next/link";
import { faqLd, ldScript } from "@/lib/seo";
import { faq as QA } from "@/lib/faq";

// หน้าคำถามที่พบบ่อย — ตัวนี้ทำเพื่อ AEO โดยเฉพาะ
// (Answer Engine Optimization = ให้ Google และผู้ช่วย AI หยิบคำตอบของเราไปตอบ)
//
// ⚠️ ทุกคำตอบต้องเป็นเรื่องที่ร้านทำจริงหรือเคยเขียนไว้ในบทความของร้านเองเท่านั้น
//    ห้ามแต่งตัวเลขหรือข้อกฎหมายขึ้นมาเอง — ถ้า AI เอาไปตอบผิด คนเดือดร้อนคือลูกค้า
//    และความน่าเชื่อถือของร้านจะพังยาว

export const metadata: Metadata = {
  title: titleSuffix("คำถามที่พบบ่อย เรื่องเลื่อยยนต์"),
  description:
    "เลื่อยยนต์ต้องจดทะเบียนไหม · เลือกขนาดบาร์และโซ่ยังไง · ค่าส่งเท่าไหร่ · จ่ายเงินปลายทางได้ไหม · " +
    `รับประกันและคืนสินค้าอย่างไร — รวมคำถามที่ลูกค้าถามร้าน ${BRAND.name} บ่อยที่สุด`,
  alternates: { canonical: "/faq/" },
};


export default function FaqPage() {
  return (
    <main className="min-h-[100dvh] bg-steel-900">
      {/* FAQPage schema — ตัวที่ทำให้ Google กับผู้ช่วย AI หยิบคำตอบไปตอบได้ */}
      <script type="application/ld+json" dangerouslySetInnerHTML={ldScript(faqLd(QA))} />

      <header className="bg-safety px-4 py-3 text-white">
        <h1 className="text-[15px] font-medium">คำถามที่พบบ่อย</h1>
      </header>

      <div className="mx-2 mt-2 overflow-hidden rounded-xl bg-white">
        {QA.map((x) => (
          <section key={x.q} className="border-b border-steel-700 px-4 py-4 last:border-0">
            <h2 className="text-[14.5px] font-bold leading-snug text-ink">{x.q}</h2>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-700">{x.a}</p>
            {x.more && (
              <Link href={x.more.href} className="mt-1.5 inline-block text-[12.5px] text-safety underline">
                {x.more.t} ›
              </Link>
            )}
          </section>
        ))}
      </div>

      <section className="mx-2 mb-8 mt-2 rounded-xl bg-white p-4 text-center">
        <p className="text-[13.5px] text-ink-700">ไม่เจอคำตอบที่ต้องการ?</p>
        <p className="mt-1 text-[12px] text-ink-300">ทักแชทหาร้านได้เลย ตอบให้ทุกคำถามในเวลาทำการ</p>
        <Link href="/" className="mt-3 inline-block rounded-sm bg-safety px-6 py-2.5 text-[14px] font-semibold text-white">
          กลับหน้าแรก
        </Link>
      </section>
    </main>
  );
}
