import { randomInt } from "node:crypto";

import { type Database, tenants, users } from "@dawajin/db";
import { normalizePhoneE164, type UserRole } from "@dawajin/shared";
import { sql, type SQL } from "drizzle-orm";
import request from "supertest";

import { signAccessToken } from "../lib/jwt";

/**
 * تجهيزات هرم المستأجر لاختبارات التكامل — الموقع ← المزرعة ← العنبر.
 *
 * **مشتركة لأن ثلاثة ملفات اختبار كانت تكرّرها**، لا لتقصير ملف: التكرار كان
 * يعني أن تصحيح تجهيزة واحدة يوجب تذكّر مواضعها كلها. والإنشاء يمرّ **بالـAPI
 * الحقيقي** حيثما وُجد مسار — لا إدراج مباشر إلا لما لم يُبنَ بعد.
 *
 * لا تُحتسب في التغطية: مستثناة بلاحقة `test-support/` في إعداد التغطية.
 */

type App = Parameters<typeof request>[0];

/**
 * **بداية إسناد سارية اليوم — بتاريخ القاعدة لا بتاريخ العملية** (القرار 190).
 *
 * `start_date` بلا قيمة افتراضية عمدًا، **فكل إدراج إسناد يختار بدايته**؛
 * وهذه هي البداية الشائعة في التجهيزات: من اليوم وبلا نهاية.
 *
 * **ودالّة لا ثابتًا:** كائن `SQL` واحد مُشارَك بين إدراجات متعددة يخاطر بحالة
 * داخلية مشتركة — نفس علّة `allowAll`/`denyAll` في `entityScope.ts`.
 */
export function today(): SQL {
  return sql`CURRENT_DATE`;
}

/**
 * يومٌ مضى بتاريخ القاعدة — لمدد انتهت أو بدأت قبل اليوم.
 *
 * **والعدد يُصرَّح نوعه:** `CURRENT_DATE - $1` بمعامل بلا نوع يجعل `date + ?`
 * غير محسوم (`operator is not unique`)، فتفشل العبارة بلا علاقة بما تختبره.
 */
export function daysAgo(days: number): SQL {
  return sql`CURRENT_DATE - CAST(${days} AS integer)`;
}

/** يومٌ قادم بتاريخ القاعدة — لإسناد لم يبدأ بعد. */
export function daysAhead(days: number): SQL {
  return sql`CURRENT_DATE + CAST(${days} AS integer)`;
}

export function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("لا صف مُعاد في تجهيزة الاختبار");
  return row;
}

/** مستأجر باسم مميَّز لهذه الجولة — يمنع تصادم الجولات المتتابعة. */
export async function seedTenant(db: Database, label: string): Promise<number> {
  return firstRow(
    await db
      .insert(tenants)
      .values({ name: `مستأجر ${label}`, timezone: "Asia/Aden", feedBagWeightKg: "50" })
      .returning({ id: tenants.id })
  ).id;
}

/**
 * مستخدم بدور محدَّد ورمز دخوله.
 * `signAccessToken` **غير متزامنة** — نسيان `await` يرسل `[object Promise]`
 * في الترويسة فيرتدّ 401 بلا سبب ظاهر (وقع فعلًا أثناء بناء الدفعة 4).
 */
export async function seedUser(
  db: Database,
  args: { tenantId: number; role: UserRole; secret: string }
): Promise<{ id: number; token: string }> {
  const phone = `07${randomInt(1000000, 9999999).toString()}`;
  const user = firstRow(
    await db
      .insert(users)
      .values({
        tenantId: args.tenantId,
        fullName: `مستخدم ${args.role}`,
        role: args.role,
        phone,
        phoneE164: normalizePhoneE164(phone, "+967"),
        passwordHash: "x",
      })
      .returning({ id: users.id })
  );
  return {
    id: user.id,
    token: await signAccessToken(
      { sub: String(user.id), tenantId: args.tenantId, role: args.role },
      args.secret,
      "1h"
    ),
  };
}

function created(res: request.Response, what: string): number {
  if (res.status !== 201) {
    throw new Error(`تعذّر إنشاء ${what}: ${String(res.status)} ${JSON.stringify(res.body)}`);
  }
  return (res.body as { id: number }).id;
}

/** موقع عبر `POST /api/sites`. */
export async function siteVia(app: App, token: string, name: string): Promise<number> {
  return created(
    await request(app).post("/api/sites").set("Authorization", `Bearer ${token}`).send({ name }),
    "الموقع"
  );
}

/** مزرعة عبر `POST /api/sites/:siteId/farms`. */
export async function farmVia(
  app: App,
  token: string,
  siteId: number,
  name: string
): Promise<number> {
  return created(
    await request(app)
      .post(`/api/sites/${String(siteId)}/farms`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name, powerSources: ["مولدات"] }),
    "المزرعة"
  );
}

/** عنبر عبر `POST /api/farms/:farmId/houses` — المسار الحقيقي منذ الدفعة 4. */
export async function houseVia(
  app: App,
  token: string,
  farmId: number,
  name: string
): Promise<number> {
  return created(
    await request(app)
      .post(`/api/farms/${String(farmId)}/houses`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name }),
    "العنبر"
  );
}
