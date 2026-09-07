// ตัวแทน coredb/blobs/attendance สำหรับทดสอบ core-returns กับ SQLite จริงในเครื่อง
import { execFileSync } from "node:child_process";
import fs from "node:fs";
export const DB = "/tmp/gucut-returns-test.sqlite";
export function coreReady() { return true; }
export async function coreQuery(sql) {
  const out = execFileSync("sqlite3", ["-json", DB, sql], { encoding: "utf8" });
  return out.trim() ? JSON.parse(out) : [];
}
const mem = new Map();
export function getStore() {
  return {
    async set(k, v) { mem.set(k, v); },
    async get(k) { return mem.get(k) ?? null; },
    async list({ prefix }) {
      return { blobs: [...mem.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
}
export async function findByPin(pin) {
  const map = { "1111": { id: "e1", name: "สมชาย" }, "2222": { id: "e2", name: "สมหญิง" } };
  return map[String(pin)] ?? null;
}
