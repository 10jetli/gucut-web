// ตัวรัน — คัดลอกไลบรารีจริงแล้วสลับ import ไปที่ shim (ไม่แตะไฟล์จริง)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, "../../netlify/lib/core-returns.mjs"), "utf8");
const swapped = src
  .replace('from "@netlify/blobs"', 'from "./shim.mjs"')
  .replace('from "./coredb.mjs"', 'from "./shim.mjs"')
  .replace('from "./attendance.mjs"', 'from "./shim.mjs"');
if (swapped === src) throw new Error("สลับ import ไม่สำเร็จ — ไลบรารีเปลี่ยนรูป import ไปแล้ว");
fs.writeFileSync(path.join(here, "mod.mjs"), swapped);
execFileSync("node", [path.join(here, "run.mjs")], { stdio: "inherit" });
