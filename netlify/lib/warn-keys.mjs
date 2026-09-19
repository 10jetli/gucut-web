/* 🤖 ไฟล์นี้ถูกสร้างอัตโนมัติโดย `scripts/gen-warn-keys.mjs` ตอน prebuild — **ห้ามแก้มือ**
 * 🔴 ห้ามเปลี่ยนเป็น `.json` — ตัวรวมไฟล์ของ Netlify ไม่เอา .json ที่อ่านด้วย `createRequire`
 *    ติดไปกับฟังก์ชัน ⇒ production จะได้ null แบบเงียบ ๆ (เจอจริง 19 ก.ย. 2569) */
export const ตารางคีย์มีเงื่อนไข = {
  "🔑 อ่านไฟล์นี้ยังไง": "`คีย์` = ชื่อคีย์ที่ท่อรุ่นนี้ **ใส่แบบมีเงื่อนไข** ⇒ คำตอบปกติจะไม่มีคีย์นั้น · ใช้แยกสามสถานะ: คีย์อยู่ในรายชื่อ + คำตอบไม่มีคีย์ = **ปกติจริง** · คีย์ไม่อยู่ในรายชื่อ = **ท่อรุ่นนี้ยังไม่รู้จัก ⇒ \"ไม่รู้\" ไม่ใช่เขียว** · คำตอบมีคีย์ = **เงื่อนไขของคีย์นั้นเป็นจริง** (คีย์เตือน ⇒ มีปัญหา · คีย์ข้อมูล ⇒ มีค่าให้ส่ง)",
  "⚠️ ในรายชื่อนี้มีสองพันธุ์ปนกัน": "**คีย์เตือน** (`truncated` · `limitClamped` · `marketplacesStale` …) กับ **คีย์ข้อมูลที่มีค่าก็ใส่** (`name` · `from` · `q` · `type` · `page_token` …) · 🚫 **ไม่แยกให้โดยตั้งใจ** — จะแยกต้องจัดประเภทจากชื่อ ซึ่งคือการเดา (กฎของทีม: ห้ามใช้ substring จัดประเภท · ชื่อที่คนตั้งเองมีคำของประเภทอื่นปนเสมอ) · ปลายทางที่ต้องการเฉพาะคีย์เตือน ให้ถือรายชื่อของตัวเองว่าสนใจคีย์ไหน แล้วใช้รายชื่อนี้ตอบคำถามเดียว: **\"ท่อรุ่นนี้รู้จักคีย์นั้นหรือยัง\"**",
  "ขอบเขต": "รายชื่อคีย์ที่ท่อรุ่นนี้ออกได้ — **ไม่ได้บอกว่าเส้นไหนออกคีย์ไหน** · 🚫 ห้ามอ่านเกินนี้ (เช่นสรุปรายเส้น) · และแก้ได้แค่ครึ่งเดียวโดยตั้งใจ: ถ้าเส้นที่เรียก **ไม่เคยออกคีย์นั้นเลย** ในเส้นนั้นจอก็ยังกลับไปอ่าน \"ไม่มีคีย์ = ปกติ\" อีกรอบ (ตกลงกับฝั่งจอ 19 ก.ย. 2569 — ยอมรับโดยรู้ตัว เพราะการสกัดรายเส้นที่ผิดแต่ดูถูก แย่กว่าข้อจำกัดที่รู้ตัว · ขยับเป็นรายเส้นเมื่อมีหลักฐานว่าเจ็บตรงไหน ไม่ใช่เดาล่วงหน้า)",
  "การสกัด": "สกัดจากซอร์สตอน build (`scripts/gen-warn-keys.mjs`) ไม่ใช่พิมพ์มือ ⇒ ค้างไม่ได้โดยโครงสร้าง · จับเฉพาะรูป `...(เงื่อนไข ? { … } : {})` / `...(เงื่อนไข && { … })` ⇒ คีย์ที่ใส่ด้วยท่าอื่น (`if (x) out.k = …`) **สกัดไม่ได้** ⇒ อ่านว่า \"อย่างน้อยเท่านี้\" ไม่ใช่ \"เท่านี้เท่านั้น\"",
  "สร้างเมื่อ": "2026-09-19T16:00:46.553Z",
  "ไฟล์ที่นับ": [
    "netlify/functions/core.mjs",
    "netlify/lib/core-contacts.mjs",
    "netlify/lib/core-freshness.mjs",
    "netlify/lib/core-orders.mjs",
    "netlify/lib/core-products.mjs",
    "netlify/lib/core-purchases.mjs",
    "netlify/lib/core-returns.mjs",
    "netlify/lib/core-stock.mjs",
    "netlify/lib/core-sync.mjs",
    "netlify/lib/pos.mjs",
    "netlify/lib/zort-document-rows.mjs",
    "netlify/lib/zort-finance.mjs",
    "netlify/lib/zort-write.mjs",
    "netlify/lib/order-status.mjs",
    "netlify/lib/d1move.mjs",
    "netlify/lib/stock-push-common.mjs",
    "netlify/lib/stock-push-guards.mjs",
    "netlify/lib/stock-push-live.mjs",
    "netlify/lib/stock-push-shopee.mjs",
    "netlify/lib/stock-push-sweep.mjs",
    "netlify/lib/stock-push-tiktok.mjs",
    "netlify/lib/mkp-finance-mirror.mjs",
    "netlify/lib/mkp-finance-probe.mjs",
    "netlify/lib/mkp-finance-store.mjs",
    "netlify/lib/mkp-finance.mjs"
  ],
  "บล็อกที่อ่าน": 57,
  "จำนวนคีย์": 44,
  "คีย์": [
    "⚠️ ไม่ครบ",
    "⚠️ อ่านยอดรวมอย่างไร",
    "amountIncomplete",
    "blankReason",
    "channel",
    "channelCounts",
    "depthCapped",
    "diffs",
    "extraCols",
    "from",
    "ignored",
    "ignoredNote",
    "itemsHeaderOnly",
    "itemsRewrittenForAll",
    "limitClamped",
    "limitRequested",
    "lineRepairsSkipped",
    "marketplacesFrom",
    "marketplacesStale",
    "marketplacesStaleMs",
    "maxDepth",
    "missingCols",
    "moveResult",
    "name",
    "note",
    "notFiredThisRound",
    "offsetRequested",
    "page_token",
    "planAgeMs",
    "q",
    "shipStatusFrom",
    "shipStatusUnverified",
    "src",
    "stateRowsPending",
    "tgt",
    "to",
    "toIgnoredValue",
    "type",
    "unknown",
    "unknownStores",
    "unverified",
    "verdict",
    "warnings",
    "x-wrote"
  ],
  "คีย์มาจากไฟล์ไหน": {
    "⚠️ ไม่ครบ": [
      "lib/core-sync.mjs"
    ],
    "⚠️ อ่านยอดรวมอย่างไร": [
      "lib/core-sync.mjs"
    ],
    "amountIncomplete": [
      "lib/core-sync.mjs"
    ],
    "blankReason": [
      "lib/core-orders.mjs"
    ],
    "channel": [
      "lib/core-stock.mjs"
    ],
    "channelCounts": [
      "lib/core-stock.mjs"
    ],
    "depthCapped": [
      "lib/core-stock.mjs"
    ],
    "diffs": [
      "lib/d1move.mjs"
    ],
    "extraCols": [
      "lib/d1move.mjs"
    ],
    "from": [
      "lib/core-returns.mjs"
    ],
    "ignored": [
      "functions/core.mjs"
    ],
    "ignoredNote": [
      "functions/core.mjs"
    ],
    "itemsHeaderOnly": [
      "lib/core-sync.mjs"
    ],
    "itemsRewrittenForAll": [
      "lib/core-sync.mjs"
    ],
    "limitClamped": [
      "lib/zort-document-rows.mjs"
    ],
    "limitRequested": [
      "lib/zort-document-rows.mjs"
    ],
    "lineRepairsSkipped": [
      "lib/core-purchases.mjs"
    ],
    "marketplacesFrom": [
      "lib/core-stock.mjs"
    ],
    "marketplacesStale": [
      "lib/core-products.mjs",
      "lib/core-stock.mjs"
    ],
    "marketplacesStaleMs": [
      "lib/core-products.mjs",
      "lib/core-stock.mjs"
    ],
    "maxDepth": [
      "lib/core-stock.mjs"
    ],
    "missingCols": [
      "lib/d1move.mjs"
    ],
    "moveResult": [
      "lib/core-returns.mjs"
    ],
    "name": [
      "lib/core-returns.mjs"
    ],
    "note": [
      "lib/core-returns.mjs"
    ],
    "notFiredThisRound": [
      "lib/stock-push-sweep.mjs"
    ],
    "offsetRequested": [
      "lib/core-stock.mjs"
    ],
    "page_token": [
      "lib/mkp-finance.mjs"
    ],
    "planAgeMs": [
      "lib/stock-push-common.mjs",
      "lib/stock-push-live.mjs"
    ],
    "q": [
      "functions/core.mjs",
      "lib/core-purchases.mjs"
    ],
    "shipStatusFrom": [
      "lib/core-orders.mjs"
    ],
    "shipStatusUnverified": [
      "lib/core-orders.mjs"
    ],
    "src": [
      "lib/d1move.mjs"
    ],
    "stateRowsPending": [
      "lib/stock-push-sweep.mjs"
    ],
    "tgt": [
      "lib/d1move.mjs"
    ],
    "to": [
      "lib/core-returns.mjs"
    ],
    "toIgnoredValue": [
      "lib/mkp-finance.mjs"
    ],
    "type": [
      "lib/core-purchases.mjs",
      "lib/zort-finance.mjs"
    ],
    "unknown": [
      "lib/stock-push-live.mjs"
    ],
    "unknownStores": [
      "lib/core-sync.mjs"
    ],
    "unverified": [
      "lib/order-status.mjs"
    ],
    "verdict": [
      "lib/core-returns.mjs"
    ],
    "warnings": [
      "lib/zort-write.mjs"
    ],
    "x-wrote": [
      "functions/core.mjs"
    ]
  }
};
