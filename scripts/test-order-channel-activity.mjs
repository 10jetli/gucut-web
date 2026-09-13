#!/usr/bin/env node
// listChannels ต้องคืนหลักฐานวันล่าสุด/สถานะช่องทางจาก SQL ทั้งประวัติ ไม่ใช่เดาจากชื่อ
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../netlify/lib/core-orders.mjs", import.meta.url), "utf8");
const start = source.indexOf("export async function listChannels(");
const end = source.indexOf("\n\n/** จอ \"บริการส่งสินค้า\"", start);
assert.ok(start >= 0 && end > start, "listChannels boundaries");
let sql = "", params = [];
const coreQuery = async (q, p) => {
  sql = q; params = p;
  return [
    { channel: "ช่องทางเก่า", lastOrder: "2000-01-01", orders: "8" },
    { channel: "ช่องทางใหม่", lastOrder: "2999-01-01", orders: "3" },
  ];
};
const fn = new Function("coreReady", "coreQuery", "num", `${source.slice(start, end).replace("export async function", "async function")}\nreturn listChannels;`)(
  () => true, coreQuery, (v) => Number(v) || 0,
);
const out = await fn("z2");
assert.match(sql, /MAX\(order_date\) AS lastOrder/);
assert.deepEqual(params, ["z2"]);
assert.deepEqual(out.map((x) => [x.channel, x.lastOrder, x.orders, x.alive]), [
  ["ช่องทางเก่า", "2000-01-01", 8, false],
  ["ช่องทางใหม่", "2999-01-01", 3, true],
]);
assert.ok(out.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.dormantCutoff)));
console.log("PASS: channels carry lastOrder, alive, and dormantCutoff from the full source scope");
