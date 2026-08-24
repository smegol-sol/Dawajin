import { createDbClient, type Database } from "@dawajin/db";
import pino from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApp } from "../app";
import { loadEnv } from "../lib/env";
import { assertIsTestDatabase } from "../lib/testGuard";

type Pool = ReturnType<typeof createDbClient>["pool"];

interface HealthResponseBody {
  status: string;
  database?: string | null;
  environment?: string;
}

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
    const body = res.body as HealthResponseBody;

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.database).toContain("test");
    expect(body.environment).toBeDefined();
  });
});

describe("GET /ready", () => {
  it("يُرجع ready عند اتصال قاعدة البيانات", async () => {
    const env = loadEnv();
    const app = createApp(db, env, pino({ level: "silent" }));

    const res = await request(app).get("/ready");
    const body = res.body as HealthResponseBody;

    expect(res.status).toBe(200);
    expect(body.status).toBe("ready");
  });
});
