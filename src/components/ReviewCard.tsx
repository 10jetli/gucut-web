import Stars from "./Stars";
import { durLabel, videoPoster, videoSrc, type Review } from "@/lib/types";

// การ์ดรีวิว 1 ใบ — ไม่ระบุว่ามาจากแพลตฟอร์มไหน
export default function ReviewCard({ r }: { r: Review }) {
  return (
    <li className="py-3 first:pt-0">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-steel-700 text-[10px] font-semibold text-[#555]">
          {initial(r.author)}
        </span>
        <span className="truncate text-[13px] text-[#333]">{r.author}</span>
        <span className="ml-auto shrink-0 rounded bg-[#f0fbf3] px-1.5 py-0.5 text-[10px] font-medium text-[#1f9254]">
          ซื้อจริง
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <Stars value={r.rating} />
        <span className="text-[11px] text-steel-300">{thaiDate(r.date)}</span>
      </div>

      {r.text && <p className="mt-1.5 text-[13px] leading-relaxed text-[#444]">{r.text}</p>}

      {/* คลิปจากลูกค้า — เก็บไฟล์ไว้บนเว็บเราเอง เล่นได้ตลอด ไม่หมดอายุ */}
      {r.video && (
        <div className="mt-2">
          <div className="relative inline-block overflow-hidden rounded-lg bg-black">
            <video
              src={videoSrc(r.video)}
              poster={videoPoster(r.video)}
              controls
              playsInline
              preload="none"
              className="block max-h-[300px] w-auto max-w-full"
            />
            <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {durLabel(r.video.dur)}
            </span>
          </div>
        </div>
      )}

      {r.images.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
          {r.images.slice(0, 5).map((src) => (
            <div
              key={src}
              className="relative h-20 w-20 shrink-0 overflow-hidden rounded border border-steel-700 bg-white"
            >
              {/* รูปรีวิวเก็บไว้เองเป็น WebP 480px อยู่แล้ว — เสิร์ฟตรงจาก CDN เร็วกว่า
                  ส่งผ่านตัวย่อรูปอีกที (ตัวย่อครั้งแรกใช้ ~2.4 วิ ตรงนี้เหลือ ~50 ms) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

function initial(name: string) {
  const c = name.trim()[0];
  return c && c !== "*" ? c.toUpperCase() : "ผ";
}

const MONTHS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
export function thaiDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y + 543}`;
}
