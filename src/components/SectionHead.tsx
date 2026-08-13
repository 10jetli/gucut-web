import Link from "next/link";

// หัวข้อประจำหมวด — แถบส้มนำหน้าชื่อ คือลายเซ็นที่ใช้ซ้ำทั้งเว็บ
// ทำเป็นชิ้นเดียวใช้ทุกที่ เพื่อให้ทุกหมวดหน้าตาเหมือนกันเป๊ะ
export default function SectionHead({
  title,
  href,
  count,
  as: Tag = "h2",
  bare = false,
  children,
}: {
  title: string;
  href?: string;
  count?: number;
  /** ใช้ h1 เมื่อเป็นหัวข้อหลักของหน้า */
  as?: "h1" | "h2";
  /** true = ไม่ใส่ระยะขอบซ้ายขวา (ใช้ในกล่องที่มี padding อยู่แล้ว) */
  bare?: boolean;
  /** ของแถมข้าง ๆ ชื่อ เช่น ตัวนับถอยหลังของ Flash Sale */
  children?: React.ReactNode;
}) {
  return (
    <div className={`mb-2 flex items-center justify-between gap-2${bare ? "" : " px-3"}`}>
      <div className="flex min-w-0 items-center gap-2">
        <Tag className="flex items-center gap-2 truncate font-heading text-[17px] font-bold leading-none text-ink">
          <span aria-hidden className="h-[19px] w-[4px] shrink-0 rounded-full bg-safety" />
          {title}
        </Tag>
        {children}
      </div>
      {href && (
        <Link href={href} className="shrink-0 text-xs font-medium text-safety">
          ดูทั้งหมด{count ? ` (${count})` : ""} ›
        </Link>
      )}
    </div>
  );
}
