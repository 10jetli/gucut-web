import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, titleSuffix } from "@/lib/shop";
import { SITE_URL } from "@/lib/site";
import {
  LICENSEE, LICENSES, activeLicenses, isActive, summaryLine, thaiDate,
} from "@/lib/licenses";

export const metadata: Metadata = {
  title: titleSuffix("ใบอนุญาตประกอบกิจการ"),
  description:
    `${LICENSEE.name} ผู้ผลิตและจำหน่ายเลื่อยโซ่ยนต์ ${BRAND.name} ` +
    "ได้รับใบอนุญาตถูกต้องตามพระราชบัญญัติเลื่อยโซ่ยนต์ พ.ศ. 2545 — ตรวจสอบเลขที่ใบอนุญาตได้",
  alternates: { canonical: `${SITE_URL}/policy/license/` },
};

export default function Page() {
  const active = activeLicenses();

  // ⚠️ บอกเครื่องอ่านด้วยว่าใครได้รับอนุญาตอะไร ไม่ใช่แค่คนอ่าน
  //    ผู้ช่วย AI หยิบตรงนี้ไปตอบลูกค้าที่ถามว่า "ร้านนี้ขายถูกกฎหมายไหม"
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.name,
    legalName: LICENSEE.name,
    taxID: LICENSEE.taxId,
    url: `${SITE_URL}/`,
    address: { "@type": "PostalAddress", streetAddress: LICENSEE.address, addressCountry: "TH" },
    hasCredential: active.map((l) => ({
      "@type": "EducationalOccupationalCredential",
      credentialCategory: "license",
      name: l.kind,
      identifier: l.no,
      datePublished: l.issued,
      recognizedBy: { "@type": "GovernmentOrganization", name: l.authority },
    })),
  };

  return (
    <main className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <h1 className="font-heading text-[22px] font-bold text-ink">ใบอนุญาตประกอบกิจการ</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-700">
        เลื่อยโซ่ยนต์เป็นสินค้าควบคุมตาม <b>พระราชบัญญัติเลื่อยโซ่ยนต์ พ.ศ. 2545</b> ·
        ผู้ผลิต นำเข้า มีไว้ในครอบครอง หรือซ่อมแซมเพื่อสินจ้าง ต้องได้รับอนุญาตจากนายทะเบียนเลื่อยโซ่ยนต์
      </p>

      <section className="mt-4 rounded-sm bg-white p-4">
        <h2 className="text-[15px] font-semibold text-ink">ผู้ได้รับใบอนุญาต</h2>
        <dl className="mt-2 space-y-1 text-[14px]">
          <div className="flex gap-2">
            <dt className="w-32 shrink-0 text-ink-300">ชื่อนิติบุคคล</dt>
            <dd className="text-ink">{LICENSEE.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-32 shrink-0 text-ink-300">เลขนิติบุคคล</dt>
            <dd className="tabular-nums text-ink">{LICENSEE.taxId}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-32 shrink-0 text-ink-300">ที่ตั้ง</dt>
            <dd className="text-ink">{LICENSEE.address}</dd>
          </div>
        </dl>
      </section>

      <h2 className="mt-6 text-[15px] font-semibold text-ink">
        ใบอนุญาตที่ใช้ได้อยู่ ({active.length} ฉบับ)
      </h2>
      <div className="mt-2 space-y-2">
        {LICENSES.map((l) => {
          const ok = isActive(l);
          return (
            <article
              key={l.no}
              className={"rounded-sm p-3.5 " + (ok ? "bg-white" : "bg-steel-800 opacity-70")}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="text-[14px] font-semibold text-ink">{l.kind}</h3>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                    (ok ? "bg-[#1f9254] text-white" : "bg-steel-600 text-ink-300")
                  }
                >
                  {ok ? "ใช้ได้อยู่" : "หมดอายุแล้ว"}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-ink-700">
                เลขที่ <b className="tabular-nums">{l.no}</b> · ออกเมื่อ {thaiDate(l.issued)}
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-300">
                {l.expires === null
                  ? "ไม่มีวันหมดอายุ ตราบที่ยังประกอบกิจการและไม่ขาดคุณสมบัติตามที่กฎหมายกำหนด"
                  : `สิ้นอายุ ${thaiDate(l.expires)}`}
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-300">ออกโดย {l.authority}</p>
              {l.note && <p className="mt-0.5 text-[12.5px] text-ink-300">{l.note}</p>}
            </article>
          );
        })}
      </div>

      <p className="mt-4 rounded-sm bg-white p-3.5 text-[12.5px] leading-relaxed text-ink-700">
        {summaryLine()}
      </p>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-300">
        ⚠️ ผู้ซื้อเลื่อยโซ่ยนต์มีหน้าที่ตามกฎหมายของตนเองด้วย —
        การมีเลื่อยโซ่ยนต์ไว้ในครอบครองต้องขอใบอนุญาต (แบบ ลซ.3) จากนายทะเบียนในพื้นที่
        ดูรายละเอียดที่ <Link href="/faq/" className="text-safety underline">คำถามที่พบบ่อย</Link>
      </p>
    </main>
  );
}
