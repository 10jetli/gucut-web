// สร้าง src/data/videos.json — รายการคลิปสินค้าทั้งหมด
//
// รันครั้งเดียวตอนย้ายข้อมูลออกจาก Shopify ไม่ได้รันตอน build
//   node scripts/gen-videos.mjs <ไฟล์.jsonl>
//
// ไฟล์ jsonl ได้จาก bulk operation ของ Shopify Admin API:
//
//   mutation {
//     bulkOperationRunQuery(query: """
//       { products { edges { node { id handle title status
//           media { edges { node { mediaContentType
//             ... on Video { id duration originalSource { url }
//                            sources { url format mimeType width height }
//                            preview { image { url } } } } } } } } } }
//     """) { bulkOperation { id status } userErrors { field message } }
//   }
//
// แล้วรอจน currentBulkOperation.status = COMPLETED ค่อยโหลดไฟล์จาก .url
//
// ⚠️ ตอนนี้ src กับ poster ยังชี้ไปที่ cdn.shopify.com
// ถ้าวันหนึ่งย้ายไฟล์มาเก็บเอง (แบบ public/rv-video/) ให้แก้ที่ toLocal ใน
// src/lib/videos.ts จุดเดียว ไม่ต้องรันสคริปต์นี้ใหม่

import { readFileSync, writeFileSync } from "node:fs";

const src = process.argv[2];
if (!src) {
  console.error("ใช้: node scripts/gen-videos.mjs <ไฟล์.jsonl>");
  process.exit(1);
}

const lines = readFileSync(src, "utf8").trim().split("\n").map((l) => JSON.parse(l));

// bulk operation คายผลออกมาเป็นบรรทัดแบน ๆ ลูกผูกกับพ่อผ่าน __parentId
const products = new Map();
const clips = [];
for (const l of lines) {
  if (l.id?.includes("/Product/")) products.set(l.id, l);
  else if (l.mediaContentType === "VIDEO") clips.push(l);
}

// เลือกไฟล์ mp4 ที่ความกว้างใกล้ค่าที่ขอที่สุด (ไม่เอา m3u8 เพราะมีแค่บางคลิป)
const pick = (sources, want) => {
  const mp4 = (sources ?? []).filter((s) => s.format === "mp4");
  if (!mp4.length) return null;
  return mp4.reduce((best, s) =>
    Math.abs(s.width - want) < Math.abs(best.width - want) ? s : best
  );
};

const out = [];
const skipped = { noProduct: 0, notActive: 0, noMp4: 0 };

for (const c of clips) {
  const p = products.get(c.__parentId);
  if (!p) { skipped.noProduct++; continue; }
  if (p.status !== "ACTIVE") { skipped.notActive++; continue; }

  // 480p พอสำหรับฟีดบนมือถือ — คลิปเล่นเองตอนเลื่อน ถ้าใช้ 720p กินเน็ตลูกค้า 3 เท่า
  const sd = pick(c.sources, 480);
  const hd = pick(c.sources, 720);
  if (!sd) { skipped.noMp4++; continue; }

  out.push({
    id: c.id.split("/").pop(),
    h: p.handle,
    t: p.title,
    dur: Math.round((c.duration ?? 0) / 1000),
    vw: sd.width,
    vh: sd.height,
    src: sd.url,
    hd: hd && hd.url !== sd.url ? hd.url : undefined,
    poster: c.preview?.image?.url ?? undefined,
  });
}

// เรียงตามลำดับสินค้าใน Shopify — คลิปของสินค้าเดียวกันจะอยู่ติดกัน
const order = new Map([...products.keys()].map((id, i) => [id, i]));
out.sort((a, b) => {
  const pa = [...products.values()].find((p) => p.handle === a.h);
  const pb = [...products.values()].find((p) => p.handle === b.h);
  return order.get(pa.id) - order.get(pb.id);
});

writeFileSync("src/data/videos.json", JSON.stringify(out, null, 1) + "\n");
console.log(`เขียน src/data/videos.json — ${out.length} คลิป จาก ${new Set(out.map((v) => v.h)).size} สินค้า`);
console.log("ข้าม:", skipped);
