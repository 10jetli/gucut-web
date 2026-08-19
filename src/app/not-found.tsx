import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, titleSuffix } from "@/lib/shop";
import NotFoundBeacon from "@/components/NotFoundBeacon";

// หน้าที่ขึ้นเมื่อลูกค้าเปิด URL ที่ไม่มีอยู่
//
// ⚠️ ห้ามปล่อยให้เป็นหน้าเปล่า ๆ ที่เขียนว่า 404
//    URL เก่าสมัยอยู่ Shopify ยังมีคนแชร์อยู่ คนที่กดเข้ามาคือลูกค้าที่ตั้งใจจะซื้อ
//    ต้องมีทางให้เขาไปต่อได้ทันที ไม่ใช่ปล่อยให้ปิดหน้าไป
export const metadata: Metadata = {
  title: titleSuffix("ไม่พบหน้าที่ต้องการ"),
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <NotFoundBeacon />
      <span className="text-5xl">🔍</span>
      <h1 className="text-[17px] font-bold text-ink">ไม่พบหน้าที่ต้องการ</h1>
      <p className="max-w-sm text-[13.5px] leading-relaxed text-ink-300">
        หน้านี้อาจถูกย้ายหรือลบไปแล้ว — ลองค้นหาสินค้าที่ต้องการ
        หรือเลือกจากหมวดหมู่ได้เลย ร้าน{BRAND.name}มีอะไหล่กว่า 2,400 รายการ
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/search/" className="rounded-sm bg-safety px-4 py-2.5 text-[13px] font-semibold text-white">
          ค้นหาสินค้า
        </Link>
        <Link href="/categories/" className="rounded-sm border border-steel-700 px-4 py-2.5 text-[13px] font-medium text-ink">
          ดูทุกหมวดหมู่
        </Link>
        <Link href="/" className="rounded-sm border border-steel-700 px-4 py-2.5 text-[13px] font-medium text-ink">
          หน้าแรก
        </Link>
      </div>
    </main>
  );
}
