// ผลตรวจสุขภาพ SEO เป็น JSON — /api/seo-audit (สำหรับหลังร้านหลัก admin.gucut.com)
// ข้อมูลสร้างตอน build โดย scripts/gen-audit-json.mjs (bundle มากับฟังก์ชัน)
import auditData from "../lib/audit-data.json";
import { adminGate } from "../lib/admin-gate.mjs";

export default async function handler(req, context) {
  const gate = await adminGate(req, context);
  if (gate.deny) return gate.deny;
  if (!gate.ok) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  return new Response(JSON.stringify(auditData), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
export const config = { path: "/api/seo-audit" };
