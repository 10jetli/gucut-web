import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, titleSuffix } from "@/lib/shop";
import { SITE_URL } from "@/lib/site";
import {
  DISTRIBUTORSHIPS, LICENSEE, LICENSES, OFFICIAL_SOURCES, REGISTRY, TRADEMARKS,
  TRADEMARK_AUTHORITY, activeLicenses, activeTrademarks, isActive, isTrademarkActive,
  summaryLine, thaiDate, trademarkSummary,
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
  const activeTm = activeTrademarks();

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
    brand: activeTm.map((t) => ({
      "@type": "Brand",
      name: t.mark,
      identifier: [
        {
          "@type": "PropertyValue",
          propertyID: "ทะเบียนเครื่องหมายการค้า (ประเทศไทย)",
          value: t.regNo,
        },
      ],
      owner: { "@type": "Organization", name: t.owner },
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

      <h2 className="mt-6 text-[15px] font-semibold text-ink">
        เครื่องหมายการค้าที่จดทะเบียนแล้ว ({activeTm.length} เครื่องหมาย)
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
        ใบอนุญาตด้านบนตอบว่า &ldquo;ขายได้ตามกฎหมายไหม&rdquo; ·
        ส่วนหัวข้อนี้ตอบว่า &ldquo;ของแท้ไหม ใครเป็นเจ้าของแบรนด์&rdquo;
      </p>
      <div className="mt-2 space-y-2">
        {TRADEMARKS.map((t) => {
          const ok = isTrademarkActive(t);
          return (
            <article
              key={t.regNo}
              className={"rounded-sm p-3.5 " + (ok ? "bg-white" : "bg-steel-800 opacity-70")}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="text-[14px] font-semibold text-ink">{t.mark}</h3>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                    (ok ? "bg-[#1f9254] text-white" : "bg-steel-600 text-ink-300")
                  }
                >
                  {ok ? "อยู่ในอายุคุ้มครอง" : "ต้องต่ออายุ"}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-ink-700">
                ทะเบียนเลขที่ <b className="tabular-nums">{t.regNo}</b> ·
                คำขอเลขที่ <span className="tabular-nums">{t.appNo}</span>
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-300">
                เจ้าของ {t.owner} · จำพวกที่ {t.niceClass} {t.goods}
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-300">
                จดทะเบียน {thaiDate(t.registered)} · สิ้นอายุ {thaiDate(t.expires)} (ต่ออายุได้ทุก 10 ปี)
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-300">ออกโดย {TRADEMARK_AUTHORITY}</p>
            </article>
          );
        })}
      </div>

      <p className="mt-4 rounded-sm bg-white p-3.5 text-[12.5px] leading-relaxed text-ink-700">
        {trademarkSummary()}
      </p>

      <h2 className="mt-6 text-[15px] font-semibold text-ink">หนังสือแต่งตั้งตัวแทนจำหน่าย</h2>
      <div className="mt-2 space-y-2">
        {DISTRIBUTORSHIPS.map((d) => (
          <article key={d.brand} className="rounded-sm bg-white p-3.5">
            <h3 className="text-[14px] font-semibold text-ink">{d.brand}</h3>
            <p className="mt-1 text-[13px] text-ink-700">{d.scope}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-300">
              ผู้แต่งตั้ง: {d.appointer} ({d.appointerRole})
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-300">
              ผู้ได้รับแต่งตั้ง: {d.appointee} · {d.appointeeAddress}
            </p>
            <p className="mt-0.5 text-[12.5px] text-ink-300">
              ออกให้เมื่อ {thaiDate(d.issued)}
              {d.expires === null ? " · หนังสือไม่ระบุวันสิ้นสุด" : ` · สิ้นสุด ${thaiDate(d.expires)}`}
            </p>
          </article>
        ))}
      </div>

      <h2 className="mt-6 text-[15px] font-semibold text-ink">
        มีชื่ออยู่ในบัญชีของกรมป่าไม้
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
        {REGISTRY.source}
      </p>
      <div className="mt-2 space-y-2">
        {REGISTRY.entries.map((e) => (
          <div key={e.no} className="rounded-sm bg-white p-3">
            <p className="text-[13.5px] font-medium text-ink">
              ลำดับที่ {e.no} · จังหวัด{e.province}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-700">{e.name}</p>
            <p className="mt-0.5 text-[12.5px] text-ink-300">ประเภท: {e.role}</p>
          </div>
        ))}
      </div>

      <h2 className="mt-6 text-[15px] font-semibold text-ink">ตรวจสอบกับหน่วยงานราชการ</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-700">
        กรมป่าไม้เผยแพร่ฐานข้อมูลผู้ประกอบการที่ได้รับอนุญาตไว้เอง ตรวจสอบได้จากลิงก์ด้านล่าง
        ไม่ต้องเชื่อคำบอกเล่าของร้าน
      </p>
      <ul className="mt-2 space-y-2">
        {OFFICIAL_SOURCES.map((s) => (
          <li key={s.url} className="rounded-sm bg-white p-3">
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13.5px] font-medium text-safety underline underline-offset-2"
            >
              {s.label} ↗
            </a>
            <p className="mt-0.5 text-[12px] text-ink-300">{s.note}</p>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[12px] leading-relaxed text-ink-300">
        ⚠️ ผู้ซื้อเลื่อยโซ่ยนต์มีหน้าที่ตามกฎหมายของตนเองด้วย —
        การมีเลื่อยโซ่ยนต์ไว้ในครอบครองต้องขอใบอนุญาต (แบบ ลซ.3) จากนายทะเบียนในพื้นที่
        ดูรายละเอียดที่ <Link href="/faq/" className="text-safety underline">คำถามที่พบบ่อย</Link>
      </p>
    </main>
  );
}
