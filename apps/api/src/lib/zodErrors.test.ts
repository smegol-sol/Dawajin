import { HttpError } from "@dawajin/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { translateZodError } from "./zodErrors";

describe("translateZodError", () => {
  it("يحوّل ZodError إلى 400 برسالة عربية عامة وتفاصيل الحقول (القرار #62)", () => {
    const schema = z.object({ phone: z.string().min(1), password: z.string().min(1) });
    let caught: unknown;
    try {
      schema.parse({ phone: "", password: "" });
    } catch (error) {
      caught = error;
    }

    const translated = translateZodError(caught);
    expect(translated).toBeInstanceOf(HttpError);
    expect(translated?.status).toBe(400);
    expect(translated?.code).toBe("invalid_input");
    expect(translated?.message).toBe("بيانات غير صالحة");
    expect(translated?.details).toHaveProperty("phone");
  });

  it("يعيد null لخطأ ليس ZodError", () => {
    expect(translateZodError(new Error("شيء آخر"))).toBeNull();
  });
});
