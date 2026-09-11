#!/usr/bin/env node
// Regression for the list=stock route adapter only. It never imports coredb or uses credentials.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../netlify/functions/core.mjs", import.meta.url), "utf8");
const start = source.indexOf('    if (p.get("list") === "stock") {');
const end = source.indexOf('    /* ── เบา: เอาแค่ป้ายชื่อร้าน', start);
assert.ok(start >= 0 && end > start, "list=stock route block must exist");
const block = source.slice(start, end);
assert.ok(block.includes("return okJson("), "list=stock must use the shared okJson helper");

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const route = new AsyncFunction(
  "url", "listStock", "okJson", "waitUntil",
  `const p = url.searchParams;\n${block}`
);

async function run(query, result) {
  let received;
  const output = await route(
    new URL(`http://fixture.invalid/api/core?list=stock&${query}`),
    async (options) => { received = options; return result; },
    (payload, status = 200) => ({ payload, status }),
    () => {}
  );
  return { output, received };
}

for (const channel of ["shopee", "lazada", "tiktok", "gucut", "none"]) {
  const { output, received } = await run(`channel=${channel}&limit=200&offset=3`, {
    channel, rowsMatched: 1, rowsReturned: 1, rows: [{ sku: "fixture" }],
  });
  assert.equal(received.channel, channel, `forward channel=${channel}`);
  assert.equal(received.limit, "200");
  assert.equal(received.offset, "3");
  assert.equal(output.status, 200);
  assert.equal(output.payload.channel, channel);
}

const invalid = await run("channel=abc", { error: "channel ต้องเป็นค่าที่รองรับ" });
assert.equal(invalid.received.channel, "abc");
assert.equal(invalid.output.status, 400, "unknown channel must be HTTP 400");
assert.equal(invalid.output.payload.error, "channel ต้องเป็นค่าที่รองรับ");

const noChannel = await run("q=abc", { rows: [] });
assert.equal(noChannel.received.channel, null, "missing channel remains absent");
assert.equal(noChannel.output.status, 200);

const thrown = new Error("injected listStock failure");
await assert.rejects(
  route(new URL("http://fixture.invalid/api/core?list=stock&channel=shopee"),
    async () => { throw thrown; }, () => assert.fail("okJson must not hide thrown failures"), () => {}),
  thrown
);

console.log("PASS: list=stock forwards five supported channel values and maps returned errors to HTTP 400");
