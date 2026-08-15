"use client";

// แถบบนสุดของหน้าสินค้า แบบ Shopee — ปุ่มลอยบนรูป: ย้อนกลับ | แชร์ · ตะกร้า · เมนู ⋮
//
// ตอนอยู่บนสุด ปุ่มเป็นวงกลมดำโปร่งลอยทับรูปสินค้า (ไม่บังรูป)
// เลื่อนลงพ้นรูปแล้วพื้นหลังเข้มค่อย ๆ ทึบขึ้นเอง ปุ่มจะได้ไม่จมไปกับเนื้อหา
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cartCount } from "@/lib/cart";

export default function ProductTopBar({
  onHelp,
  shareTitle,
}: {
  onHelp: () => void;      // กด "ต้องการความช่วยเหลือ?" แล้วเปิดแชทกับร้าน
  shareTitle: string;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [count, setCount] = useState(0);
  const [solid, setSolid] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ตัวเลขบนตะกร้า — ชุดเดียวกับที่เมนูล่างใช้ จะได้ไม่มีทางขึ้นไม่ตรงกัน
  useEffect(() => {
    const load = () => setCount(cartCount());
    load();
    window.addEventListener("cart-updated", load);
    return () => window.removeEventListener("cart-updated", load);
  }, []);

  // พื้นหลังทึบเมื่อเลื่อนพ้นรูปสินค้า
  // รูปเป็นจัตุรัส = สูงเท่าความกว้างของกรอบเนื้อหา ซึ่งกว้างสุดที่ 512px (max-w-lg)
  // ถ้าคิดจากความกว้างจอเฉย ๆ บนจอคอมจะเพี้ยน เพราะรูปไม่ได้กว้างเท่าจอ
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > Math.min(window.innerWidth, 512) * 0.75);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const say = (t: string) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2000);
  };

  // มือถือส่วนใหญ่มีแผ่นแชร์ของระบบให้อยู่แล้ว — ไม่มีค่อยคัดลอกลิงก์ให้แทน
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: shareTitle, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      say("คัดลอกลิงก์แล้ว");
    } catch {
      /* ผู้ใช้กดยกเลิกแผ่นแชร์ = ไม่ต้องทำอะไร */
    }
  };

  const round =
    "flex h-9 w-9 items-center justify-center rounded-full transition-colors " +
    (solid ? "bg-white/10" : "bg-black/45 backdrop-blur-sm");

  return (
    <>
      <div
        className={
          "fixed inset-x-0 top-0 z-50 mx-auto flex max-w-lg items-center justify-between px-2.5 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] transition-colors " +
          (solid ? "bg-carbon shadow-[0_1px_6px_rgba(0,0,0,0.25)]" : "")
        }
      >
        <button onClick={() => router.back()} aria-label="ย้อนกลับ" className={round}>
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-white stroke-2">
            <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex items-center gap-2">
          <button onClick={share} aria-label="แชร์สินค้านี้" className={round}>
            <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] fill-none stroke-white stroke-[1.8]">
              <path d="M12 4v11M12 4L8 8M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 13v5.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V13" strokeLinecap="round" />
            </svg>
          </button>

          <Link href="/cart/" aria-label={`ตะกร้าสินค้า ${count} ชิ้น`} className={`relative ${round}`}>
            <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] fill-none stroke-white stroke-[1.7]">
              <path d="M3 4h2l2.4 11.2a2 2 0 002 1.6h7.7a2 2 0 002-1.6L21 8H6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="10" cy="20" r="1.2" className="fill-white" />
              <circle cx="18" cy="20" r="1.2" className="fill-white" />
            </svg>
            {count > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-safety px-1 text-[10px] font-bold leading-none text-white">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>

          <button onClick={() => setMenu(true)} aria-label="เมนูเพิ่มเติม" className={round}>
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-white">
              <circle cx="12" cy="5" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="12" cy="19" r="1.7" />
            </svg>
          </button>
        </div>
      </div>

      {/* ---------- เมนู ⋮ ---------- */}
      {menu && (
        <div className="fixed inset-0 z-[65]" onClick={() => setMenu(false)}>
          <div
            className="absolute inset-x-0 mx-auto max-w-lg px-2.5"
            style={{ top: "calc(env(safe-area-inset-top) + 3.25rem)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ml-auto w-60 overflow-hidden rounded-xl bg-carbon-dark text-white shadow-[0_6px_24px_rgba(0,0,0,0.35)]">
              <MenuItem
                icon="M4 10.5L12 4l8 6.5V20h-6v-5h-4v5H4v-9.5z"
                label="กลับไปหน้าหลัก"
                href="/"
              />
              <MenuItem
                icon="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"
                label="หมวดหมู่สินค้าทั้งหมด"
                href="/categories/"
              />
              <MenuItem
                icon="M12 3a9 9 0 100 18 9 9 0 000-18zM9.8 9.3A2.3 2.3 0 0114.3 10c0 1.6-2.3 1.8-2.3 3.4M12 17.2v.1"
                label="ต้องการความช่วยเหลือ?"
                onClick={() => { setMenu(false); onHelp(); }}
              />
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-0 top-1/2 z-[80] mx-auto w-fit rounded-lg bg-black/80 px-4 py-2.5 text-[13px] text-white">
          {toast}
        </div>
      )}
    </>
  );
}

function MenuItem({
  icon, label, href, onClick,
}: { icon: string; label: string; href?: string; onClick?: () => void }) {
  const inner = (
    <>
      <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] shrink-0 fill-none stroke-white stroke-[1.6]">
        <path d={icon} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[14px]">{label}</span>
    </>
  );
  const cls =
    "flex w-full items-center gap-3 border-b border-white/12 px-4 py-3.5 text-left last:border-0 active:bg-white/10";
  return href ? (
    <Link href={href} className={cls}>{inner}</Link>
  ) : (
    <button onClick={onClick} className={cls}>{inner}</button>
  );
}
