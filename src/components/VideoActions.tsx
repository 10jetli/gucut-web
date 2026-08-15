"use client";

// แถบปุ่มขวาของคลิป แบบ TikTok — ตะกร้า · หัวใจ · คอมเมนต์ · บันทึก · แชร์
// ตัวเลขใต้ปุ่มมาจาก /api/social (ทุกคนเห็นเลขเดียวกัน)
// ส่วน "ฉันกดไปแล้วหรือยัง" เก็บในเครื่องลูกค้า กดได้เลยไม่ต้องล็อกอิน
import Link from "next/link";
import { useState } from "react";
import { shortCount, toggleLike, toggleSave } from "@/lib/social";

export default function VideoActions({
  id, liked, likes, comments, saved, productHref, onLike, onSave, onComment, onToast,
}: {
  id: string;
  liked: boolean;
  likes: number;
  comments: number;
  saved: boolean;
  productHref?: string;
  onLike: (on: boolean) => void;
  onSave: (on: boolean) => void;
  onComment: () => void;
  onToast: (msg: string) => void;
}) {
  const [pop, setPop] = useState(false);   // หัวใจเด้งตอนกด

  const like = () => {
    const on = toggleLike(id);
    onLike(on);
    if (on) { setPop(true); setTimeout(() => setPop(false), 320); }
  };

  const save = () => {
    const on = toggleSave(id);
    onSave(on);
    onToast(on ? "บันทึกคลิปไว้แล้ว — ดูได้ที่หน้าบัญชี" : "เอาออกจากที่บันทึกแล้ว");
  };

  const share = async () => {
    const url = `${window.location.origin}/videos/?v=${id}`;
    try {
      if (navigator.share) { await navigator.share({ title: "คลิปจากร้าน GUCUT", url }); return; }
      await navigator.clipboard.writeText(url);
      onToast("คัดลอกลิงก์คลิปแล้ว");
    } catch {
      /* ลูกค้ากดยกเลิกแผ่นแชร์ = ไม่ต้องทำอะไร */
    }
  };

  return (
    <div className="pointer-events-auto absolute bottom-32 right-2 z-10 flex flex-col items-center gap-4">
      {/* ตะกร้าปักไว้กับคลิป — มีเฉพาะคลิปที่ผูกสินค้าไว้ */}
      {productHref && (
        <Link href={productHref} aria-label="ดูสินค้าในคลิปนี้" className="flex flex-col items-center gap-1">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-safety shadow-lg">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] fill-none stroke-white stroke-[1.9]">
              <path d="M3 4h2l2.4 11.2a2 2 0 002 1.6h7.7a2 2 0 002-1.6L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="10" cy="20" r="1.3" className="fill-white" />
              <circle cx="18" cy="20" r="1.3" className="fill-white" />
            </svg>
          </span>
          <span className="text-[11px] font-medium drop-shadow">สินค้า</span>
        </Link>
      )}

      {/* หัวใจ */}
      <button onClick={like} aria-label={liked ? "เลิกถูกใจ" : "ถูกใจ"} className="flex flex-col items-center gap-1">
        <svg
          viewBox="0 0 24 24"
          className={`h-9 w-9 drop-shadow transition-transform ${pop ? "scale-125" : "scale-100"} ${
            liked ? "fill-[#ff2d55] stroke-[#ff2d55]" : "fill-white/15 stroke-white"
          } stroke-[1.7]`}
        >
          <path d="M12 20s-7-4.4-7-9.2A4 4 0 0112 8.4a4 4 0 017-2.6c0 4.8-7 14.2-7 14.2z" strokeLinejoin="round" />
        </svg>
        <span className="text-[11px] font-medium tabular-nums drop-shadow">{shortCount(likes)}</span>
      </button>

      {/* คอมเมนต์ */}
      <button onClick={onComment} aria-label="คอมเมนต์" className="flex flex-col items-center gap-1">
        <svg viewBox="0 0 24 24" className="h-9 w-9 fill-white/15 stroke-white stroke-[1.7] drop-shadow">
          <path d="M21 11.5a8.4 8.4 0 01-9 8.4 9.6 9.6 0 01-2.7-.4L4 21l1.6-4.1A8.1 8.1 0 013 11.5 8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z" strokeLinejoin="round" />
        </svg>
        <span className="text-[11px] font-medium tabular-nums drop-shadow">{shortCount(comments)}</span>
      </button>

      {/* บันทึกไว้ดูทีหลัง */}
      <button onClick={save} aria-label={saved ? "เอาออกจากที่บันทึก" : "บันทึกคลิป"} className="flex flex-col items-center gap-1">
        <svg
          viewBox="0 0 24 24"
          className={`h-9 w-9 stroke-[1.7] drop-shadow ${saved ? "fill-[#ffc400] stroke-[#ffc400]" : "fill-white/15 stroke-white"}`}
        >
          <path d="M6.5 4h11v16l-5.5-4-5.5 4V4z" strokeLinejoin="round" />
        </svg>
        <span className="text-[11px] font-medium drop-shadow">บันทึก</span>
      </button>

      {/* แชร์ */}
      <button onClick={share} aria-label="แชร์คลิปนี้" className="flex flex-col items-center gap-1">
        <svg viewBox="0 0 24 24" className="h-9 w-9 fill-white/15 stroke-white stroke-[1.7] drop-shadow">
          <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" strokeLinecap="round" />
          <path d="M12 3.5v11M12 3.5L8.5 7M12 3.5L15.5 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[11px] font-medium drop-shadow">แชร์</span>
      </button>
    </div>
  );
}
