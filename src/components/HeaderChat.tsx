"use client";

// ปุ่มแชทบนหัวเว็บ — กดแล้วเปิดแผ่นแชทตัวเดียวกับที่ใช้ในหน้าสินค้า
//
// ตัวเลขแดง = ข้อความจากร้านที่ลูกค้ายังไม่ได้เปิดอ่าน
// นับจากเวลาที่ลูกค้าเปิดแชทครั้งล่าสุด (เก็บในเครื่อง) เทียบกับเวลาของข้อความฝั่งร้าน
//
// ⚠️ ประหยัดเครดิต Netlify — ลูกค้าที่ยังไม่เคยแชทจะ "ไม่ยิง API เลยสักครั้ง"
//    (ไม่มี cid ในเครื่อง = ไม่มีห้องแชท) และตอนสลับไปแท็บอื่นก็หยุดถาม
import { useEffect, useState } from "react";
import ChatSheet from "./ChatSheet";
import Portal from "./Portal";

const CID_KEY = "gucut-chat-id";
const SEEN_KEY = "gucut-chat-seen";
const POLL_MS = 60000;

export default function HeaderChat() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    // เปิดอ่านแล้ว = เคลียร์ตัวเลขแดง และไม่ต้องถามซ้ำระหว่างเปิดอยู่
    if (open) {
      localStorage.setItem(SEEN_KEY, String(Date.now()));
      setUnread(0);
      return;
    }
    const cid = localStorage.getItem(CID_KEY);
    if (!cid) return;
    let stop = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const r = await fetch(`/api/chat?cid=${encodeURIComponent(cid)}`);
        if (!r.ok) return;
        const j = await r.json();
        const seen = Number(localStorage.getItem(SEEN_KEY) || 0);
        const msgs: { from: string; at: number }[] = j.thread?.messages || [];
        if (!stop) setUnread(msgs.filter((m) => m.from === "s" && m.at > seen).length);
      } catch {
        /* ต่อร้านไม่ได้ก็แค่ไม่ขึ้นตัวเลข ไม่ต้องรบกวนลูกค้า */
      }
    };
    load();
    const t = setInterval(load, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={unread ? `แชทกับร้าน มีข้อความใหม่ ${unread} ข้อความ` : "แชทกับร้าน"}
        className="relative shrink-0 p-1"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-white stroke-[1.8]">
          <path
            d="M21 11.5a8.4 8.4 0 01-9 8.4 9.6 9.6 0 01-2.7-.4L4 21l1.6-4.1A8.1 8.1 0 013 11.5 8.4 8.4 0 0112 3a8.4 8.4 0 019 8.5z"
            strokeLinejoin="round"
          />
          <circle cx="8.5" cy="11.5" r="1" className="fill-white stroke-none" />
          <circle cx="12" cy="11.5" r="1" className="fill-white stroke-none" />
          <circle cx="15.5" cy="11.5" r="1" className="fill-white stroke-none" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-safety px-1 text-[9px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {/* ต้องผ่าน Portal — ไม่งั้นโดนเมนูล่างทับ (หัวเว็บ sticky z-40 กดชั้นซ้อนไว้) */}
      {open && (
        <Portal>
          <ChatSheet open={open} onClose={() => setOpen(false)} />
        </Portal>
      )}
    </>
  );
}
