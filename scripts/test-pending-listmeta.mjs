#!/usr/bin/env node
// Proves pending=1 listMeta through the actual route block; never imports coredb or uses credentials.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = readFileSync(new URL("../netlify/functions/core.mjs", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../netlify/lib/coredb.mjs", import.meta.url), "utf8");
const START = '    if (url.searchParams.get("pending")) {';
const END = '    if (url.searchParams.get("cardguess")) {';
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const NOW = Date.parse("2026-09-11T03:00:00Z");
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}

function pendingRoute(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END, start);
  assert.ok(start >= 0 && end > start, "pending route boundaries must exist");
  const block = text.slice(start, end)
    .replace('const { coreQuery } = await import("../lib/coredb.mjs");', "");
  assert.ok(!block.includes("import("), "fixture must never load real coredb/credentials");
  return new AsyncFunction("url", "coreQuery", "json", "Date", block);
}

function literal(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "pending-listmeta-"));
  const path = join(dir, "fixture.sqlite");
  const statements = [...schemaSource.matchAll(/`(CREATE (?:TABLE|INDEX) IF NOT EXISTS (?:orders|idx_orders_\w+)\b[^`]+)`/g)]
    .map(([, sql]) => `${sql};`).join("\n");
  const migrations = [...schemaSource.matchAll(/`(ALTER TABLE orders ADD COLUMN [^`]+)`/g)]
    .map(([, sql]) => `${sql};`).join("\n");
  execFileSync("sqlite3", [path], { input: `${statements}\n${migrations}` });
  return {
    exec(sql) { execFileSync("sqlite3", [path], { input: sql }); },
    query(sql, params = []) {
      let i = 0;
      const bound = sql.replaceAll("?", () => literal(params[i++]));
      assert.equal(i, params.length);
      const out = execFileSync("sqlite3", ["-json", path], { input: bound, encoding: "utf8" }).trim();
      return out ? JSON.parse(out) : [];
    },
    close() { rmSync(dir, { recursive: true, force: true }); },
  };
}

async function run(route, db) {
  return route(new URL("http://fixture.invalid/api/core?pending=1&store=z1"),
    (sql, params) => db.query(sql, params), (body, status = 200) => ({ body, status }), FixedDate);
}

const db = fixture();
const rows = [];
for (let i = 0; i < 60; i++) {
  rows.push(`(${literal(`z1/${i}`)},'z1',${literal(String(i))},'web','Pending',1,'Paid',${literal(`2026-09-${String((i % 9) + 1).padStart(2, "0")}`)})`);
}
// The route itself must exclude these, proving the result is not a hand-built response object.
rows.push("('z1/cancel','z1','cancel','web','Cancelled',1,'Paid','2026-09-10')");
rows.push("('z2/other','z2','other','web','Pending',1,'Paid','2026-09-10')");
db.exec(`INSERT INTO orders(id,source,number,channel,status,amount,pay_status,order_date) VALUES\n${rows.join(",\n")};`);

const healthy = await run(pendingRoute(source), db);
assert.equal(healthy.status, 200);
assert.equal(healthy.body["ต้องส่งของ"].length, 60);
assert.deepStrictEqual(healthy.body.listMeta["ต้องส่งของ"], { shown: 60, total: 60, truncated: false });

// Inject a defect into executable route SQL—not into the returned object. Window total remains 60,
// while the route receives only 50 rows, so this proves the real flag can turn red.
const brokenSource = source.replace("ORDER BY order_date DESC`,", "ORDER BY order_date DESC LIMIT 50`,");
assert.notEqual(brokenSource, source, "mutation must alter pending SQL");
const broken = await run(pendingRoute(brokenSource), db);
assert.equal(broken.body["ต้องส่งของ"].length, 50);
assert.deepStrictEqual(broken.body.listMeta["ต้องส่งของ"], { shown: 50, total: 60, truncated: true });

db.close();
console.log("PASS: pending route reports complete data and turns truncated=true when its SQL is actually cut");
