import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import pino from "pino";
import { createDbClient, type Database } from "@dawajin/db";
import { assertIsTestDatabase } from "../lib/testGuard";

type Pool = ReturnType<typeof createDbClient>["pool"];
import { createApp } from "../app";
import { loadEnv } from "../lib/env";

let db: Database;
let pool: Pool;

beforeAll(async () => {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error("TEST_DATABASE_URL غير معرَّف");
  const client = createDbClient(testUrl);
  db = client.db;
  pool = client.pool;
  await assertIsTestDatabase(db);
});

afterAll(async () => {
  await pool.end();
});

describe("GET /health", () => {
  it("يُرجع البيئة واسم القاعدة — حالة النجاح تتحقق من محتوى الاستجابة لا نجاح فارغ (§20)", async () => {
    const env = loadEnv();
    const app = createApp(db, env, pino({ level: "silent" }));

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toContain("test");
    expect(res.body.environment).toBeDefined();
  });
});

describe("GET /ready", () => {
  it("يُرجع ready عند اتصال قاعدة البيانات", async () => {
    const env = loadEnv();
    const app = createApp(db, env, pino({ level: "silent" }));

    const res = await request(app).get("/ready");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ready");
  });
});
