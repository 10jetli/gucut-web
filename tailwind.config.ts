import type { Config } from "tailwindcss";

// สีประจำแบรนด์ GUCUT — ส้มแดง #FF3C00 · เทาอ่อน #EFEFEF · ดำ
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // ใช้ชื่อเดิม (steel/safety) เพื่อให้ทุก component เปลี่ยนสีตามอัตโนมัติ
        steel: {
          900: "#efefef", // พื้นหลังหน้า — สีแบรนด์
          800: "#ffffff", // พื้นการ์ด/แถบ = ขาว
          700: "#dcdcdc", // เส้นขอบอ่อน (เข้มขึ้นให้เห็นบนพื้น #efefef)
          600: "#c7c7c7", // เส้นขอบเข้มขึ้น
          300: "#6b6b6b", // ตัวหนังสือรอง — ผ่านเกณฑ์อ่านง่ายบนพื้นเทา
        },
        safety: {
          DEFAULT: "#ff3c00", // ส้มแดงประจำแบรนด์
          dark: "#d93000",    // ตอนกด/ชี้
          light: "#ff7a52",   // ไล่เฉด
          tint: "#fff2ee",    // พื้นอ่อนมาก ใช้รองแถบรีวิว/ตัวกรอง
        },
        ink: {
          DEFAULT: "#1a1a1a", // ดำประจำแบรนด์ — ตัวหนังสือหลัก
          700: "#333333",     // ตัวหนังสือรอง
          500: "#6b6b6b",     // ตัวหนังสือจาง
          300: "#8a8a8a",     // ตัวหนังสือจางมาก
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
