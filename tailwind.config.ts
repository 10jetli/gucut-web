import type { Config } from "tailwindcss";

// ธีม "industrial steel + safety orange" ของ GUCUT
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ธีมขาวแนว Shopee — ใช้ชื่อเดิมเพื่อให้ทุก component พลิกตามอัตโนมัติ
        steel: {
          900: "#f5f5f5", // พื้นหลังหน้า (เทาอ่อนแบบ Shopee)
          800: "#ffffff", // พื้นการ์ด/แถบ = ขาว
          700: "#e8e8e8", // เส้นขอบอ่อน
          600: "#d5d5d5", // เส้นขอบเข้มขึ้น
          300: "#757575", // ตัวหนังสือรอง (เทา)
        },
        safety: {
          DEFAULT: "#ff6b00", // ส้ม safety สีหลัก
          dark: "#e05e00",
          light: "#ff8a33",
        },
      },
      // ฟอนต์ระบบของเครื่องลูกค้า — แนวเดียวกับ shopee.co.th ที่ไม่โหลดฟอนต์ไทยเลย
      // iOS/Mac → Sukhumvit Set · Windows → Leelawadee UI · Android → Noto Sans Thai
      // ไม่ต้องดาวน์โหลดอะไร ตัวหนังสือขึ้นตั้งแต่เฟรมแรก
      fontFamily: {
        heading: [
          "-apple-system", "BlinkMacSystemFont", "Sukhumvit Set",
          "Helvetica Neue", "Leelawadee UI", "Noto Sans Thai",
          "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif",
        ],
        body: [
          "-apple-system", "BlinkMacSystemFont", "Sukhumvit Set",
          "Helvetica Neue", "Leelawadee UI", "Noto Sans Thai",
          "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
export default config;
