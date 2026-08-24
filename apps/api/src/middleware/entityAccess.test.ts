import { HttpError } from "@dawajin/shared";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { enforceEntityAccess } from "./entityAccess";

/**
 * فروع دفاعية بحتة داخل enforceEntityAccess (لا مسار تنفيذ متوقَّع عبر
 * السلسلة الحقيقية requireAuth→requireTenant→enforceEntityAccess، لأن
 * requireTenant يرفض الحالتين قبل الوصول هنا) — لكنها موجودة فعليًا في الكود
 * ويجب تغطيتها. قاعدة بيانات وهمية تفشل فورًا لو استُدعيت، لإثبات أن هذه
 * الفروع تُقصِّر الدائرة (short-circuit) قبل أي استعلام.
 */
function throwingDb() {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("لا يجب استدعاء db في هذا الفرع الدفاعي");
      },
    }
  );
}

function fakeRequest(user: Request["user"], params: Record<string, string> = {}): Request {
  return { user, params, query: {}, body: {} } as unknown as Request;
}

describe("enforceEntityAccess — فروع دفاعية", () => {
  it("401 بلا req.user (المفروض أصلًا ألا يُصادَف بعد requireAuth)", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();

    await middleware(fakeRequest(undefined, { houseId: "1" }), {} as Response, next);

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });

  it("401 عندما tenantId يساوي null لدور غير مالك/مدير منصة (المفروض ألا يُصادَف بعد requireTenant)", async () => {
    const middleware = enforceEntityAccess(throwingDb() as never);
    const next = vi.fn();

    await middleware(
      fakeRequest({ id: 1, tenantId: null, role: "farmer" }, { houseId: "1" }),
      {} as Response,
      next
    );

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });
});
