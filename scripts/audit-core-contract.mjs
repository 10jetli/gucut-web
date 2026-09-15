#!/usr/bin/env node
// ตรวจสัญญา /api/core หลัง deploy โดยไม่สร้างหรือลบข้อมูล
// ผู้รีวิวรัน: GUCUT_CORE_AUDIT_KEY='...' node scripts/audit-core-contract.mjs

const key = process.env.GUCUT_CORE_AUDIT_KEY;
if (!key) {
  console.error("ต้องกำหนด GUCUT_CORE_AUDIT_KEY — ไม่อ่าน key จากไฟล์ในเครื่อง");
  process.exit(2);
}

const base = process.env.GUCUT_CORE_AUDIT_URL ?? "https://gucut.com/api/core";
const reads = [
  "",
  "sync=1&days=1",
  "shopeesync=1&days=1",
  "recon=1",
  "snapshot=1",
  "stock=1&days=1",
  "stockcompare=1",
  "list=missing-sku&limit=1",
  "list=orders&limit=1",
  "list=stock&limit=1",
  "list=moves&limit=1",
];

async function request(query, method, body) {
  const url = query ? `${base}?${query}` : base;
  const response = await fetch(url, {
    method,
    headers: { "x-admin-key": key, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(90_000),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

let failed = 0;
for (const query of reads) {
  const get = await request(query, "GET");
  const post = await request(query, "POST");
  const del = await request(query, "DELETE");
  const bad = get.status !== 200 || post.status !== 405 || del.status !== 405;
  console.log(`${bad ? "FAIL" : "PASS"} ${query || "(หน้าแรก)"}`, { get: get.status, post: post.status, delete: del.status });
  if (bad) failed += 1;
}

// body ว่างและ id ที่ไม่ใช่เลขต้องถูกปฏิเสธก่อนเขียนข้อมูล
for (const [query, method, body] of [
  ["move=1", "POST", {}],
  ["movedel=not-a-number", "DELETE", undefined],
]) {
  const result = await request(query, method, body);
  const bad = result.status !== 400;
  console.log(`${bad ? "FAIL" : "PASS"} ${method} ?${query}`, { status: result.status, body: result.body });
  if (bad) failed += 1;
}

// ทดสอบเฉพาะด่าน method/validation: ห้ามส่ง confirm หรือข้อมูลที่เขียน ZORT ได้
for (const query of [
  "addsale=1", "addcontact=1", "addbundle=1", "addwarehouse=1",
  "updateproduct=1", "updatebundle=1", "productimage=1",
]) {
  const result = await request(query, "GET");
  const bad = result.status !== 405;
  console.log(`${bad ? "FAIL" : "PASS"} GET ?${query}`, { status: result.status, body: result.body });
  if (bad) failed += 1;
}

for (const query of ["zortproduct=X", "productlabels=X"]) {
  const result = await request(query, "POST");
  const bad = result.status !== 405;
  console.log(`${bad ? "FAIL" : "PASS"} POST ?${query}`, { status: result.status, body: result.body });
  if (bad) failed += 1;
}

for (const [query, method, expected] of [
  ["deleteproduct=abc&sku=X&ref=AUDIT", "GET", 405],
  ["deletebundle=abc&sku=X&ref=AUDIT", "GET", 405],
  ["addcontact=1", "POST", 400],
]) {
  const result = await request(query, method, method === "POST" ? {} : undefined);
  const bad = result.status !== expected;
  console.log(`${bad ? "FAIL" : "PASS"} ${method} ?${query}`, { status: result.status, body: result.body });
  if (bad) failed += 1;
}

const invalidProductId = await request("deleteproduct=abc&sku=X&ref=AUDIT", "DELETE");
const idRejected = invalidProductId.status === 400 && /id.*ตัวเลข|ตัวเลข.*id/i.test(String(invalidProductId.body?.error ?? ""));
console.log(`${idRejected ? "PASS" : "FAIL"} DELETE ?deleteproduct=abc&sku=X&ref=AUDIT`, {
  status: invalidProductId.status,
  body: invalidProductId.body,
});
if (!idRejected) failed += 1;

const invalidBundleId = await request("deletebundle=abc&sku=X&ref=AUDIT", "DELETE");
const bundleIdRejected = invalidBundleId.status === 400 && /id.*ตัวเลข|ตัวเลข.*id/i.test(String(invalidBundleId.body?.error ?? ""));
console.log(`${bundleIdRejected ? "PASS" : "FAIL"} DELETE ?deletebundle=abc&sku=X&ref=AUDIT`, {
  status: invalidBundleId.status,
  body: invalidBundleId.body,
});
if (!bundleIdRejected) failed += 1;

process.exitCode = failed ? 1 : 0;
