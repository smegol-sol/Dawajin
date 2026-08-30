import { HttpError } from "@dawajin/shared";
import type { Request } from "express";
import { describe, expect, it } from "vitest";

import { requireTenantUser, requireUser } from "./authContext";

function fakeRequest(user?: Request["user"]): Request {
  return { user } as Request;
}

describe("requireUser", () => {
  it("يرمي 401 بلا req.user", () => {
    expect(() => requireUser(fakeRequest(undefined))).toThrow(HttpError);
    try {
      requireUser(fakeRequest(undefined));
    } catch (error) {
      expect((error as HttpError).status).toBe(401);
    }
  });

  it("يعيد req.user عند وجوده", () => {
    const user = { id: 1, tenantId: 7, role: "farmer" as const };
    expect(requireUser(fakeRequest(user))).toEqual(user);
  });
});

describe("requireTenantUser", () => {
  // الدور هنا **رمز قديم بقيمة لم تعد معلومة** (القرار 194) — والحكم واحد
  // لكل من يصل بلا مستأجر، معلوم الدور أو مجهوله.
  it("يرمي 401 عندما tenantId يساوي null", () => {
    expect(() =>
      requireTenantUser(fakeRequest({ id: 1, tenantId: null, role: "platform_admin" as never }))
    ).toThrow(HttpError);
  });

  it("يعيد المستخدم بـtenantId مضيَّق لرقم", () => {
    const result = requireTenantUser(fakeRequest({ id: 1, tenantId: 7, role: "farmer" }));
    expect(result.tenantId).toBe(7);
  });
});
