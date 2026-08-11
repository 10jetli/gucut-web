import Link from "next/link";
import Stars from "./Stars";
import ReviewCard from "./ReviewCard";
import type { Review, ReviewSummary } from "@/lib/types";

// บล็อกรีวิวบนหน้าสินค้า — สรุปดาว + รีวิวเด่น 3 ใบ + ลิงก์ไปดูทั้งหมด
export default function ReviewSection({
  summary,
  items,
  href,
  withPhoto,
}: {
  summary: ReviewSummary;
  items: Review[];
  href: string;
  withPhoto: number;
}) {
  return (
    <section id="reviews" className="mt-2 bg-steel-800 px-3 py-3">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-semibold">คะแนนสินค้า</h2>
        <Link href={href} className="text-xs text-safety">
          ดูรีวิวทั้งหมด ({summary.n.toLocaleString("th-TH")}) ›
        </Link>
      </div>

      {/* สรุปคะแนน */}
      <div className="mt-2 flex items-center gap-3 rounded-sm bg-[#fff2ee] px-3 py-2.5">
        <div className="text-center">
          <div className="font-heading text-2xl font-bold leading-none text-safety">
            {summary.a.toFixed(1)}
          </div>
          <div className="mt-0.5 text-[10px] text-steel-300">เต็ม 5</div>
        </div>
        <div>
          <Stars value={summary.a} size={15} />
          <p className="mt-1 text-[11px] text-steel-300">
            จากผู้ซื้อจริง {summary.n.toLocaleString("th-TH")} คน
            {withPhoto > 0 && ` · มีรูป ${withPhoto.toLocaleString("th-TH")}`}
          </p>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-steel-700">
          {items.map((r, n) => (
            <ReviewCard key={`${r.date}-${n}`} r={r} />
          ))}
        </ul>
      )}

      <Link
        href={href}
        className="mt-3 block rounded-lg border border-steel-600 py-2.5 text-center text-[13px] text-[#1a1a1a]"
      >
        ดูรีวิวทั้งหมด ({summary.n.toLocaleString("th-TH")})
      </Link>
    </section>
  );
}
