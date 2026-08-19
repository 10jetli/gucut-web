// ดาวแบบ Shopee — เติมสีตามคะแนนจริง รองรับครึ่งดาว
//
// count = 1 คือแบบ Lazada (ดาวดวงเดียวเต็มดวง แล้วเขียนคะแนนต่อท้าย)
// ใช้ตอนที่พื้นที่แคบ เช่น การ์ดสินค้าที่ต้องมีตัวเลข "ขายได้" ต่อบรรทัดเดียวกัน
export default function Stars({
  value,
  size = 12,
  count = 5,
}: {
  value: number;
  size?: number;
  count?: 1 | 5;
}) {
  if (count === 1)
    return (
      <span className="inline-flex align-middle" aria-label={`${value} ดาว`}>
        <Star fill={1} size={size} />
      </span>
    );
  return (
    <span className="inline-flex items-center gap-[1px] align-middle" aria-label={`${value} ดาว`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i)); // 0..1 ของดาวดวงนี้
        return <Star key={i} fill={fill} size={size} />;
      })}
    </span>
  );
}

function Star({ fill, size }: { fill: number; size: number }) {
  const id = `s${Math.round(fill * 100)}`;
  const d =
    "M12 1.8l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.6 5.8 20.9 7 14 2 9.1l6.9-1L12 1.8z";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <defs>
        <linearGradient id={id}>
          <stop offset={`${fill * 100}%`} stopColor="#d63200" />
          <stop offset={`${fill * 100}%`} stopColor="#d8d8d8" />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${id})`} />
    </svg>
  );
}
