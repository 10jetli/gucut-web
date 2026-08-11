// ดาวแบบ Shopee — เติมสีตามคะแนนจริง รองรับครึ่งดาว
export default function Stars({ value, size = 12 }: { value: number; size?: number }) {
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
          <stop offset={`${fill * 100}%`} stopColor="#ee4d2d" />
          <stop offset={`${fill * 100}%`} stopColor="#e0e0e0" />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${id})`} />
    </svg>
  );
}
