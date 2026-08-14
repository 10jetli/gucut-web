// ราคาแบบ Shopee — สัญลักษณ์ ฿ ตัวเล็กกว่าตัวเลข ทำให้ตัวเลขเด่นขึ้น
//
// ใช้ตัวนี้กับ "ราคาโชว์" (หน้าสินค้า ปุ่มซื้อ การ์ดสินค้า)
// ส่วนที่เป็นข้อความล้วน เช่น สรุปยอดในตะกร้าหรือข้อความแชท ใช้ formatPrice เหมือนเดิม
//
// ขนาด ฿ คิดเป็นสัดส่วนของตัวเลข (em) จึงเล็กลงตามอัตโนมัติทุกที่ที่เอาไปใช้

export default function Price({ value, className }: { value: number; className?: string }) {
  return (
    <span className={className}>
      <span className="text-[0.62em] font-semibold">฿</span>
      {value.toLocaleString("th-TH")}
    </span>
  );
}
