"use client";

import { useEffect, useState } from "react";

/* ตัวดึง+แสดงคลิปของ อ.ธง — คุยกับ `/api/ajthong-clips` ซึ่งกันซ้ำมาให้แล้ว 2 ชั้น
 *
 * ⚠️ **สามสถานะ ห้ามยุบเป็นสอง** — กำลังโหลด / อ่านไม่ได้ / มีรายการ
 *    ยุบเป็นสองจะได้หน้าว่างที่อ่านเหมือน "ไม่มีคลิป" ทั้งที่จริงคือยังโหลดไม่เสร็จหรือเส้นล่ม
 * ⚠️ **ของเก่าต้องประกาศตัว** — ท่อส่ง `สด: false` มาเมื่อหยิบของเก่ามาตอบ ⇒ ต้องเขียนบนจอ
 *    ไม่งั้นทางถอยจะกลายเป็นทางหลักโดยไม่มีใครรู้
 * ⚠️ **กันรูปแบบไม่ครบเสมอ** — `Array.isArray` ก่อน `.map` (ตอน deploy ใหม่ จอเก่ากับท่อใหม่
 *    อยู่ด้วยกันชั่วครู่เสมอ)
 * 🔒 ชั้นกันซ้ำสุดท้ายฝั่งจอ: กรอง id ซ้ำอีกครั้งก่อนวาด — ถูกแล้วที่ซ้ำกับฝั่งท่อ
 *    เพราะวันไหนท่อถูกแก้ผิด จอยังต้องไม่โชว์ซ้ำ (ท่านกำชับ *"อย่าลงซ้ำหล่ะ ดูดีๆ"*)
 */
type คลิป = { id: string; ชื่อ?: string; เมื่อ?: string | null; ฝังที่?: string; ดูที่?: string };

export default function AjthongClips() {
  const [สถานะ, ตั้งสถานะ] = useState<"โหลด" | "ได้" | "พลาด">("โหลด");
  const [คลิป, ตั้งคลิป] = useState<คลิป[]>([]);
  const [สด, ตั้งสด] = useState(true);

  useEffect(() => {
    let ยังอยู่ = true;
    fetch("/api/ajthong-clips")
      .then((r) => r.json())
      .then((d) => {
        if (!ยังอยู่) return;
        const รายการ: คลิป[] = Array.isArray(d?.คลิป) ? d.คลิป : [];
        const เห็น = new Set<string>();
        const ไม่ซ้ำ = รายการ.filter((c) => {
          const id = String(c?.id ?? "");
          if (!/^[A-Za-z0-9_-]{6,20}$/.test(id) || เห็น.has(id)) return false;
          เห็น.add(id);
          return true;
        });
        ตั้งคลิป(ไม่ซ้ำ);
        ตั้งสด(d?.สด !== false);
        ตั้งสถานะ(ไม่ซ้ำ.length ? "ได้" : "พลาด");
      })
      .catch(() => ยังอยู่ && ตั้งสถานะ("พลาด"));
    return () => {
      ยังอยู่ = false;
    };
  }, []);

  if (สถานะ === "โหลด")
    return <p className="mt-6 text-sm text-white/60">กำลังโหลดคลิป…</p>;

  if (สถานะ === "พลาด")
    return (
      <div className="mt-6 rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white/80">
        ตอนนี้ดึงรายการคลิปไม่ได้ ลองรีเฟรชอีกครั้งในอีกสักครู่
        <div className="mt-2">
          <a className="underline" href="https://www.youtube.com/channel/UCn1ZbCh5TK2eob3xuhyc9Og"
             target="_blank" rel="noreferrer">
            เปิดดูที่ช่อง YouTube ของ อ.ธง
          </a>
        </div>
      </div>
    );

  return (
    <>
      {!สด && (
        <p className="mt-4 rounded-lg bg-amber-400/15 px-3 py-2 text-xs text-amber-200">
          กำลังแสดงรายการที่บันทึกไว้ล่าสุด (ดึงรายการใหม่จาก YouTube ไม่ได้ในขณะนี้)
        </p>
      )}
      <ul className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {คลิป.map((c) => (
          <li key={c.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
            <div className="relative aspect-[9/16] w-full">
              <iframe
                className="absolute inset-0 h-full w-full"
                src={c.ฝังที่ ?? `https://www.youtube-nocookie.com/embed/${c.id}`}
                title={c.ชื่อ || "คลิป อ.ธง"}
                loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
            <div className="p-3">
              <p className="line-clamp-2 text-sm text-white/90">{c.ชื่อ || "คลิป อ.ธง"}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
