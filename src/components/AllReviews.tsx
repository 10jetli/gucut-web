"use client";

import { useEffect, useMemo, useState } from "react";
import Stars from "./Stars";
import ReviewCard from "./ReviewCard";
import type { Review } from "@/lib/types";

const PAGE = 20;

type Filter = "all" | "video" | "photo" | "5" | "4" | "3" | "low";

const TABS: { k: Filter; label: string }[] = [
  { k: "all", label: "ทั้งหมด" },
  { k: "video", label: "มีคลิป" },
  { k: "photo", label: "มีรูป" },
  { k: "5", label: "5 ดาว" },
  { k: "4", label: "4 ดาว" },
  { k: "3", label: "3 ดาว" },
  { k: "low", label: "1-2 ดาว" },
];

// หน้ารีวิวทั้งหมด — โหลดไฟล์ JSON ของสินค้าตัวนั้นแล้วทยอยโชว์ทีละ 20 ใบ
export default function AllReviews({
  src,
  avg,
  count,
}: {
  src: string;
  avg: number;
  count: number;
}) {
  const [items, setItems] = useState<Review[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let alive = true;
    fetch(src)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => alive && setItems(d.items as Review[]))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [src]);

  const list = useMemo(() => {
    if (!items) return [];
    switch (tab) {
      case "video": return items.filter((r) => !!r.video);
      case "photo": return items.filter((r) => r.images.length > 0 || !!r.video);
      case "5": return items.filter((r) => r.rating === 5);
      case "4": return items.filter((r) => r.rating === 4);
      case "3": return items.filter((r) => r.rating === 3);
      case "low": return items.filter((r) => r.rating <= 2);
      default: return items;
    }
  }, [items, tab]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, video: 0, photo: 0, "5": 0, "4": 0, "3": 0, low: 0 };
    if (!items) return c;
    c.all = items.length;
    for (const r of items) {
      if (r.video) c.video++;
      if (r.images.length || r.video) c.photo++;
      if (r.rating === 5) c["5"]++;
      else if (r.rating === 4) c["4"]++;
      else if (r.rating === 3) c["3"]++;
      else c.low++;
    }
    return c;
  }, [items]);

  return (
    <>
      {/* สรุปคะแนน */}
      <div className="flex items-center gap-3 bg-[#fffbf8] px-3 py-3">
        <div className="text-center">
          <div className="font-heading text-3xl font-bold leading-none text-safety">
            {avg.toFixed(1)}
          </div>
          <div className="mt-1 text-[10px] text-steel-300">เต็ม 5</div>
        </div>
        <div>
          <Stars value={avg} size={17} />
          <p className="mt-1 text-xs text-steel-300">
            จากผู้ซื้อจริง {count.toLocaleString("th-TH")} คน
          </p>
        </div>
      </div>

      {/* ตัวกรอง */}
      <div className="no-scrollbar sticky top-[52px] z-30 flex gap-2 overflow-x-auto border-b border-steel-700 bg-white px-3 py-2">
        {TABS.map((t) => {
          const n = counts[t.k];
          const off = items !== null && n === 0;
          return (
            <button
              key={t.k}
              disabled={off}
              onClick={() => { setTab(t.k); setShown(PAGE); }}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                tab === t.k
                  ? "border-safety bg-[#fff5ef] text-safety"
                  : off
                    ? "border-steel-700 text-steel-600"
                    : "border-steel-600 text-[#444]"
              }`}
            >
              {t.label}
              {items !== null && n > 0 && ` (${n.toLocaleString("th-TH")})`}
            </button>
          );
        })}
      </div>

      {items === null && !failed && (
        <p className="px-3 py-10 text-center text-sm text-steel-300">กำลังโหลดรีวิว…</p>
      )}
      {failed && (
        <p className="px-3 py-10 text-center text-sm text-steel-300">
          โหลดรีวิวไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้ง
        </p>
      )}

      {items !== null && (
        <>
          <ul className="divide-y divide-steel-700 px-3">
            {list.slice(0, shown).map((r, n) => (
              <ReviewCard key={`${r.date}-${n}`} r={r} />
            ))}
          </ul>

          {list.length === 0 && (
            <p className="px-3 py-10 text-center text-sm text-steel-300">
              ยังไม่มีรีวิวในหมวดนี้
            </p>
          )}

          {shown < list.length && (
            <div className="px-3 py-4">
              <button
                onClick={() => setShown((s) => s + PAGE)}
                className="w-full rounded-lg border border-steel-600 py-2.5 text-[13px] text-[#333]"
              >
                โหลดเพิ่ม ({(list.length - shown).toLocaleString("th-TH")} รีวิว)
              </button>
            </div>
          )}

          {items.length < count && (
            <p className="px-3 pb-6 text-center text-[11px] leading-relaxed text-steel-300">
              แสดง {items.length.toLocaleString("th-TH")} รีวิวจากทั้งหมด{" "}
              {count.toLocaleString("th-TH")} รีวิว — กำลังทยอยนำเข้าเพิ่ม
            </p>
          )}
        </>
      )}
    </>
  );
}
