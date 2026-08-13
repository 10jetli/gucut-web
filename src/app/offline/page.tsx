import type { Metadata } from "next";
import Link from "next/link";

// หน้าที่ขึ้นตอนเน็ตหลุด — service worker จะหยิบหน้านี้มาแสดงแทนจอขาว
export const metadata: Metadata = {
  title: "ออฟไลน์ | GUCUT",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="grid min-h-[70dvh] place-items-center px-8 text-center">
      <div>
        <p className="font-heading text-[34px] font-extrabold italic leading-none tracking-tight">
          <span className="text-safety">GU</span><span className="text-ink">CUT</span>
        </p>
        <p className="mt-6 text-[17px] font-medium text-ink">ตอนนี้ไม่มีสัญญาณอินเทอร์เน็ต</p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
          หน้าที่เคยเปิดไว้ยังดูได้อยู่
          <br />พอมีสัญญาณแล้วกดลองใหม่ได้เลยครับ
        </p>
        <Link
          href="/"
          className="mt-7 inline-block rounded-sm bg-safety px-8 py-3 text-[15px] font-medium text-white"
        >
          ลองใหม่อีกครั้ง
        </Link>
      </div>
    </main>
  );
}
