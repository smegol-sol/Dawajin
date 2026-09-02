import { HttpError } from "@dawajin/shared";
import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import { requireRole } from "./requireRole";

function fakeRequest(user?: Request["user"]): Request {
  return { user } as Request;
}

describe("requireRole", () => {
  it("401 بلا req.user", () => {
    const next = vi.fn();
    requireRole("owner")(fakeRequest(undefined), {} as Response, next);

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(401);
  });

  it("403 لدور غير مسموح — الرادُّ حارس الدور", () => {
    const next = vi.fn();
    requireRole("owner")(fakeRequest({ id: 1, tenantId: 1, role: "farmer" }), {} as Response, next);

    const error = next.mock.calls[0]?.[0] as HttpError;
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(403);
  });

  it("يمرّ دورًا مسموحًا", () => {
    const next = vi.fn();
    requireRole("owner", "supervisor")(
      fakeRequest({ id: 1, tenantId: 1, role: "owner" }),
      {} as Response,
      next
    );

    expect(next).toHaveBeenCalledWith();
  });
});
