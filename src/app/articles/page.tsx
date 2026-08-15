import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { articles, thaiDate } from "@/lib/articles";

// หน้ารวมบทความ — ตั้งใจ "ไม่ใส่ไว้ในเมนู" ตามที่เจ้าของร้านสั่ง
// มีไว้ให้ Google เก็บ (อยู่ใน sitemap) และให้แต่ละบทความลิงก์หากันเอง
export const metadata: Metadata = {
  title: "บทความเรื่องเลื่อยยนต์ | GUCUT",
  description:
    "รวมบทความเรื่องเลื่อยยนต์ — วิธีเลือก วิธีดูแล อาการเสียที่พบบ่อย กฎหมายเลื่อยยนต์ และเรื่องน่ารู้จากช่างที่ร้าน GUCUT",
};

export default function ArticlesPage() {
  return (
    <main className="min-h-[100dvh] bg-steel-900">
      <header className="bg-safety px-4 py-3 text-white">
        <h1 className="text-[15px] font-medium">บทความเรื่องเลื่อยยนต์</h1>
      </header>

      <div className="mx-2 mt-2 overflow-hidden rounded-xl bg-white">
        {articles.map((a) => (
          <Link
            key={a.h}
            href={`/articles/${encodeURIComponent(a.h)}/`}
            className="flex gap-3 border-b border-steel-700 p-3 last:border-0"
          >
            {a.img && (
              <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded bg-steel-900">
                <Image src={a.img} alt="" fill sizes="64px" className="object-cover" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="clamp-2 block text-[13.5px] font-medium leading-snug text-ink">{a.t}</span>
              <span className="mt-1 block text-[11px] text-ink-300">{thaiDate(a.at)}</span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
