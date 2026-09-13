#!/usr/bin/env node
// ค่าร้านที่ไม่รู้จักต้องตอบ 400 ก่อนแตะ D1 — ไม่ยอมให้ "all" กลายเป็น z1/ทั้งสองร้าน
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../netlify/functions/core.mjs", import.meta.url), "utf8");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const helperStart = source.indexOf("function coreStoreParam(");
const helperEnd = source.indexOf("\n\nlet CORE_BUILD", helperStart);
assert.ok(helperStart >= 0 && helperEnd > helperStart, "must keep the shared store validator");
const helper = source.slice(helperStart, helperEnd);

const routes = [
  ['daily', '    if (url.searchParams.get("daily") || url.searchParams.get("bycustomer")) {', '    if (url.searchParams.get("monthly")) {'],
  ['monthly', '    if (url.searchParams.get("monthly")) {', '    /* ── ขาที่สองของจอ "กระจกครบไหม"'],
  ['pending', '    if (url.searchParams.get("pending")) {', '    if (url.searchParams.get("cardguess")) {'],
  ['cardguess', '    if (url.searchParams.get("cardguess")) {', '    if (url.searchParams.get("blankwhere")) {'],
];

for (const [name, startMark, endMark] of routes) {
  const start = source.indexOf(startMark);
  const end = source.indexOf(endMark, start);
  assert.ok(start >= 0 && end > start, `${name}: route boundaries`);
  const block = source.slice(start, end)
    .replaceAll('const { coreQuery } = await import("../lib/coredb.mjs");', "");
  const route = new AsyncFunction("url", "coreQuery", "json", "Date", `${helper}\n${block}`);
  let queries = 0;
  const out = await route(
    new URL(`http://fixture.invalid/api/core?${name}=1&store=all`),
    async () => { queries++; throw new Error("D1 must not run for an invalid store"); },
    (body, status = 200) => ({ body, status }),
    Date,
  );
  assert.equal(out.status, 400, `${name}: invalid store must be HTTP 400`);
  assert.match(out.body.error, /store ต้องเป็น z1 หรือ z2/);
  assert.deepEqual(out.body.accepts, ["z1", "z2"]);
  assert.equal(queries, 0, `${name}: reject before querying D1`);
}

console.log("PASS: four /api/core store scopes reject unknown values before they can change scope");
