"use client";

// โครงหน้าเอกสารของร้าน (นโยบายความเป็นส่วนตัว / เงื่อนไขการใช้บริการ)
// หัวส้ม + ปุ่มย้อนกลับชุดเดียวกับหน้า "การซื้อของฉัน" · เนื้อหาเป็นการ์ดขาวบนพื้นเทา
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ChatSheet from "@/components/ChatSheet";
import Portal from "@/components/Portal";
import { SHOP } from "@/lib/shop";

// ---------- หัวข้อย่อยในเอกสาร ----------
export function Sec({ n, t, children }: { n: number; t: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-steel-700 px-4 py-4 first:border-0">
      <h2 className="text-[14px] font-bold text-ink">
        <span className="text-safety">{n}.</span> {t}
      </h2>
      <div className="mt-2 space-y-2 text-[13px] leading-relaxed text-ink-700">{children}</div>
    </section>
  );
}

// ---------- รายการหัวข้อย่อย ----------
export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-safety" />
          <span className="min-w-0 flex-1">{it}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PolicyPage({
  title, children,
}: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const [chat, setChat] = useState(false);

  // ช่องทางติดต่อที่กรอกไว้จริงเท่านั้น — ช่องว่างไม่ต้องขึ้น
  //
  // ⚠️ ไม่โชว์ที่อยู่ เจ้าของร้านสั่งไว้ 24 ส.ค. 2569 (Shopee/Lazada ก็ไม่โชว์)
  //    ที่อยู่ถูกถอดออกจาก SHOP ไปเลย ไม่ใช่แค่ไม่แสดง — ดูเหตุผลใน shop.ts
  //    ห้ามเอากลับมาใส่ตรงนี้ถ้าเจ้าของร้านไม่ได้สั่งเอง
  const contacts: [string, string][] = [
    ["ชื่อผู้ประกอบการ", SHOP.legalName],
    ["เลขประจำตัวผู้เสียภาษี", SHOP.taxId],
    ["LINE", SHOP.lineOa],
    ["อีเมล", SHOP.email],
    ["โทร", SHOP.phone],
  ].filter((c): c is [string, string] => !!c[1]);

  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="sticky top-0 z-40 flex items-center gap-1 bg-safety px-2 py-3 text-white">
        <button onClick={() => router.back()} aria-label="ย้อนกลับ" className="p-1 text-[22px] leading-none">‹</button>
        <span className="text-[15px] font-medium">{title}</span>
      </header>

      <article className="mx-2 mt-2 overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <p className="px-4 pt-4 text-[12px] text-ink-300">
          ปรับปรุงล่าสุด {SHOP.updated} · ใช้กับเว็บไซต์ {SHOP.site} และแอป {SHOP.brand}
        </p>
        {children}
      </article>

      {/* ---------- ติดต่อร้าน — ทุกเอกสารต้องมีช่องทางติดต่อกลับ ---------- */}
      <section className="mx-2 mb-8 mt-2 rounded-xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="text-[14px] font-bold text-ink">ติดต่อร้าน</h2>
        {contacts.length > 0 && (
          <dl className="mt-2 space-y-1 text-[13px] leading-relaxed">
            {contacts.map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="shrink-0 text-ink-300">{k}</dt>
                <dd className="min-w-0 flex-1 text-ink-700">{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="mt-2 text-[13px] leading-relaxed text-ink-700">
          ทักแชทกับร้านได้ตลอด ร้านตอบในเวลาทำการ
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => setChat(true)}
            className="rounded-sm bg-safety px-5 py-2.5 text-[13px] font-semibold text-white"
          >
            ทักแชทร้าน
          </button>
          <Link
            href="/"
            className="rounded-sm border border-steel-600 px-5 py-2.5 text-[13px] font-medium text-ink-700"
          >
            กลับหน้าแรก
          </Link>
        </div>
      </section>

      {chat && (
        <Portal>
          <ChatSheet open={chat} onClose={() => setChat(false)} />
        </Portal>
      )}
    </main>
  );
}
