"use client";

// ย้าย pop-up ไปแขวนที่ <body> แทนที่จะอยู่ในที่ที่เรียกใช้
//
// ทำไมต้องมี: หัวเว็บเป็น sticky z-40 ซึ่ง "สร้างชั้นซ้อนของตัวเอง" ทุกอย่างที่อยู่ข้างใน
// จึงถูกกดให้อยู่ระดับ 40 ตามไปด้วย ต่อให้ใส่ z-[90] ก็ยังโดนเมนูล่าง (z-50) ทับ
// พอย้ายออกมาแขวนที่ body ค่า z ถึงจะมีผลจริง
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export default function Portal({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return createPortal(children, document.body);
}
