import Image from "next/image";
import type { Detail } from "@/lib/types";

// ข้อมูลจำเพาะ + เอกสารดาวน์โหลด — ดึงมาจากรายละเอียดสินค้าเดิมบนร้าน
export default function ProductSpecs({ d, attrs }: { d?: Detail; attrs: [string, string][] }) {
  const hasAny = attrs.length > 0 || d?.specs?.length || d?.docs?.length || d?.steps?.length;
  if (!hasAny) return null;

  return (
    <>
      {/* ตารางคุณลักษณะย่อ */}
      {attrs.length > 0 && (
        <section className="mt-3 bg-steel-800 px-3 py-3">
          <h2 className="mb-2 font-heading text-base font-semibold">คุณลักษณะ</h2>
          <dl className="divide-y divide-steel-700 text-[13px]">
            {attrs.map(([k, v]) => (
              <div key={k} className="flex gap-3 py-2">
                <dt className="w-32 shrink-0 text-steel-300">{k}</dt>
                <dd className="flex-1 text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* เอกสารดาวน์โหลด — แบบฟอร์ม ลซ.1 / คู่มืออะไหล่ */}
      {d?.docs && d.docs.length > 0 && (
        <section className="mt-3 bg-steel-800 px-3 py-3">
          <h2 className="mb-2 font-heading text-base font-semibold">เอกสารดาวน์โหลด</h2>
          <ul className="space-y-2">
            {d.docs.map((doc) => (
              <li key={doc.url}>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-sm border border-safety/40 bg-safety-tint px-3 py-2.5 text-[13px] font-medium text-safety"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current stroke-2">
                    <path d="M12 3v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
                  </svg>
                  <span className="flex-1">{doc.label}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ขั้นตอนขอใบอนุญาต */}
      {d?.steps && d.steps.length > 0 && (
        <section className="mt-3 bg-steel-800 px-3 py-3">
          <h2 className="mb-2 font-heading text-base font-semibold">วิธีขอใบอนุญาตเลื่อยโซ่ยนต์</h2>
          <ol className="space-y-1.5 text-[13px] leading-relaxed text-[#4a4a4a]">
            {d.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </section>
      )}

      {/* รูปตารางสเปก / รูปอธิบายสินค้า */}
      {d?.specs && d.specs.length > 0 && (
        <section className="mt-3 bg-steel-800 px-3 py-3">
          <h2 className="mb-2 font-heading text-base font-semibold">ข้อมูลจำเพาะ</h2>
          <div className="space-y-2">
            {d.specs.map((s) => (
              <div key={s.u} className="overflow-hidden rounded-sm">
                <Image
                  src={s.u}
                  alt=""
                  width={s.w || 900}
                  height={s.h || 1200}
                  sizes="(max-width: 512px) 100vw, 512px"
                  loading="lazy"
                  className="h-auto w-full"
                />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
