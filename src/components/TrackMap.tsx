"use client";

// แผนที่เส้นทางพัสดุแบบ Shopee — วาดเองใน SVG ไม่พึ่งบริการแผนที่ข้างนอก
// (เจ้าของร้านอยากให้ลูกค้าได้ประสบการณ์เหมือน Shopee — 27 ส.ค. 2569)
//
// ⚠️ ตำแหน่งรถเป็น "โดยประมาณจากเวลา" ไม่ใช่ GPS จริง — มีป้ายบอกบนแผนที่เสมอ ห้ามถอด
//    Flash ไม่เปิดตำแหน่งจริงให้ระบบภายนอก (ต่างจาก SPX ที่เป็นขนส่งของ Shopee เอง)

import { PROVINCE_LL, TH_OUTLINE, project } from "@/lib/thmap";

const W = 300;
const H = 420;

/** ตำแหน่งบนเส้นโค้ง quadratic bezier ที่สัดส่วน t (0..1) */
function bez(p0: [number, number], pc: [number, number], p1: [number, number], t: number): [number, number] {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * pc[0] + t * t * p1[0],
    u * u * p0[1] + 2 * u * t * pc[1] + t * t * p1[1],
  ];
}

export default function TrackMap({
  fromProvince,
  toProvince,
  progress,
  done,
}: {
  fromProvince: string;
  toProvince: string;
  /** สัดส่วนเวลาที่ผ่านไปของช่วงส่ง 0..1 */
  progress: number;
  done: boolean;
}) {
  const from = PROVINCE_LL[fromProvince];
  const to = PROVINCE_LL[toProvince];
  if (!from || !to) return null; // จังหวัดสะกดไม่ตรงทะเบียน = ไม่วาด ไม่พัง

  const a = project(from, W, H);
  const b = project(to, W, H);
  // จุดคุมเส้นโค้ง — บ่ายเส้นออกด้านข้างนิดหน่อยให้ดูเป็นเส้นทาง ไม่ใช่ไม้บรรทัด
  const pc: [number, number] = [(a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.12, (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.12];
  const t = done ? 1 : Math.min(0.92, Math.max(0.06, progress));
  const truck = bez(a, pc, b, t);

  const outline = TH_OUTLINE.map((ll, i) => {
    const [x, y] = project(ll, W, H);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ") + " Z";

  return (
    <div className="relative mt-2 overflow-hidden rounded-lg bg-[#d9efe4]">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full">
        {/* แผ่นดิน */}
        <path d={outline} fill="#b8e0cb" stroke="#8fcbaf" strokeWidth="1.5" strokeLinejoin="round" />
        {/* เส้นทาง */}
        <path
          d={`M${a[0]},${a[1]} Q${pc[0]},${pc[1]} ${b[0]},${b[1]}`}
          fill="none"
          stroke="#ef4d2f"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="1 7"
        />
        {/* ต้นทาง (ร้าน) */}
        <circle cx={a[0]} cy={a[1]} r="5" fill="#ef4d2f" stroke="#fff" strokeWidth="2" />
        {/* ปลายทาง (บ้านลูกค้า) */}
        <circle cx={b[0]} cy={b[1]} r="7" fill="#fff" stroke="#ef4d2f" strokeWidth="2.5" />
        <circle cx={b[0]} cy={b[1]} r="2.5" fill="#ef4d2f" />
      </svg>
      {/* รถ — วางเป็น HTML ทับ SVG จะได้ใช้อีโมจิคมชัดทุกจอ */}
      <span
        className="absolute -translate-x-1/2 -translate-y-1/2 text-[26px] drop-shadow"
        style={{ left: `${(truck[0] / W) * 100}%`, top: `${(truck[1] / H) * 100}%` }}
        aria-hidden
      >
        {done ? "🏠" : "🚚"}
      </span>
      {/* ป้ายบอกสถานะบนแผนที่ */}
      <span
        className="absolute -translate-x-1/2 rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-[#ef4d2f] shadow"
        style={{
          left: `${Math.min(80, Math.max(20, (truck[0] / W) * 100))}%`,
          top: `${Math.max(3, (truck[1] / H) * 100 - 11)}%`,
        }}
      >
        {done ? "จัดส่งสำเร็จ" : "พัสดุอยู่ระหว่างขนส่ง"}
      </span>
      {/* ชื่อจังหวัดปลายทาง */}
      <span
        className="absolute -translate-x-1/2 text-[10.5px] font-medium text-[#1a1a1a]/70"
        style={{ left: `${(b[0] / W) * 100}%`, top: `${Math.min(95, (b[1] / H) * 100 + 3)}%` }}
      >
        {toProvince}
      </span>
      {/* ⚠️ ป้ายความจริง — ห้ามถอด */}
      <span className="absolute bottom-1.5 right-2 rounded bg-white/80 px-1.5 py-0.5 text-[9.5px] text-steel-300">
        เส้นทางโดยประมาณ ไม่ใช่ตำแหน่งจริง
      </span>
    </div>
  );
}
