import { HttpError } from "@dawajin/shared";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { requirePlatformAdmin, requirePlatformAdminContext } from "./platformAuth";
import { signAccessToken, signPlatformToken } from "../lib/jwt";

/**
 * فروع الرفض في حارس المنصة — **طبقة صلاحيات، فعتبتها 100%** كأخواتها
 * (`auth` · `tenant` · `entityAccess`). وقاعدة بيانات وهمية تُرجع ما يُطلب منها
 * بلا خادم: الفروع هنا **تُقصّر الدائرة قبل أي منطق أعمال**.
 */
const SECRET = "platform-guard-test-secret";

function fakeDb(rows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve(rows),
        }),
      }),
    }),
  } as never;
}

function fakeRequest(authorization?: string, path = "/platform/auth/me"): Request {
  return { headers: authorization ? { authorization } : {}, path } as unknown as Request;
}

async function run(db: unknown, req: Request) {
  const next = vi.fn();
  await requirePlatformAdmin(db as never, SECRET)(req, {} as Response, next);
  return next.mock.calls[0]?.[0] as HttpError | undefined;
}

describe("requirePlatformAdmin — فروع الرفض", () => {
  it("401 بلا ترويسة Authorization", async () => {
    const error = await run(fakeDb([]), fakeRequest());
    expect(error?.status).toBe(401);
  });

  it("401 لرمز غير صالح التوقيع", async () => {
    const error = await run(fakeDb([]), fakeRequest("Bearer not-a-token"));
    expect(error?.status).toBe(401);
  });

  it("401 لرمز مستأجر صحيح التوقيع — النوع لا يطابق، بلا كشف السبب", async () => {
    const token = await signAccessToken({ sub: "1", tenantId: 1, role: "owner" }, SECRET, "30d");
    const error = await run(fakeDb([]), fakeRequest(`Bearer ${token}`));

    expect(error?.status).toBe(401);
    expect(error?.message).toBe("رمز الدخول غير صالح أو منتهٍ");
  });

  it("401 لمدير غير موجود في الجدول", async () => {
    const token = await signPlatformToken({ sub: "99", tokenType: "platform" }, SECRET, "30d");
    const error = await run(fakeDb([]), fakeRequest(`Bearer ${token}`));
    expect(error?.status).toBe(401);
  });

  it("401 لمدير معطَّل — التعطيل يقطع الجلسة القائمة", async () => {
    const token = await signPlatformToken({ sub: "7", tokenType: "platform" }, SECRET, "30d");
    const db = fakeDb([{ id: 7, isActive: false, mustChangePassword: false }]);
    const error = await run(db, fakeRequest(`Bearer ${token}`));
    expect(error?.status).toBe(401);
  });

  it("403 لكلمة مؤقتة لم تُبدَّل على مسار غير مسموح — الرادُّ حارس مصادقة المنصة", async () => {
    const token = await signPlatformToken({ sub: "7", tokenType: "platform" }, SECRET, "30d");
    const db = fakeDb([{ id: 7, isActive: true, mustChangePassword: true }]);
    const error = await run(db, fakeRequest(`Bearer ${token}`, "/platform/admins/reset-password"));

    expect(error?.status).toBe(403);
    expect(error?.code).toBe("password_change_required");
  });

  it("يمرّ حين يكتمل الشرطان — ويضع سياق المدير", async () => {
    const token = await signPlatformToken({ sub: "7", tokenType: "platform" }, SECRET, "30d");
    const db: never = fakeDb([{ id: 7, isActive: true, mustChangePassword: false }]);
    const req = fakeRequest(`Bearer ${token}`);
    const next = vi.fn();

    await requirePlatformAdmin(db, SECRET)(req, {} as Response, next);

    expect(next).toHaveBeenCalledWith();
    expect(requirePlatformAdminContext(req)).toEqual({ id: 7 });
  });

  it("requirePlatformAdminContext يرمي 401 بلا سياق — حارس نوع لا مسار متوقَّع", () => {
    expect(() => requirePlatformAdminContext(fakeRequest())).toThrow(HttpError);
  });
});
