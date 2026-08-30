import { HttpError } from "@dawajin/shared";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { requireTenant } from "./tenant";

function fakeRequest(user?: Request["user"]): Request {
  return { user } as Request;
}

describe("requireTenant", () => {
  it("401 بلا req.user", () => {
    const next = vi.fn();
    requireTenant(fakeRequest(undefined), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });

  /**
   * **حُوِّل لا حُذف** (القرار 194): كان يُثبت أن مدير المنصة **يمرّ** بـ
   * `tenantId: null`، **وصار يُثبت أن لا أحد يمرّ بها** — القيمة نفسها،
   * والحكم انقلب. **ورمزٌ قديم بدور لم يعد معلومًا** (`platform_admin` أُزيل
   * من `USER_ROLE`) **يُرفض بلا استثناء**.
   */
  it("401 لرمز قديم بدور غير معلوم وtenantId null — لا استثناء لأحد", () => {
    const next = vi.fn();
    requireTenant(
      // القيمة لم تعد في `UserRole` — والإسقاط يحاكي رمزًا قديمًا لا كودًا جديدًا
      fakeRequest({ id: 1, tenantId: null, role: "platform_admin" as never }),
      {} as Response,
      next
    );

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });

  it("401 لمستخدم عادي بلا tenantId (حساب غير مرتبط بمستأجر)", () => {
    const next = vi.fn();
    requireTenant(fakeRequest({ id: 1, tenantId: null, role: "farmer" }), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });

  it("يمرّ مستخدمًا عاديًا مرتبطًا بمستأجر", () => {
    const next = vi.fn();
    requireTenant(fakeRequest({ id: 1, tenantId: 7, role: "farmer" }), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });
});
