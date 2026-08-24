import { isGeneratedTemporaryPassword, TEMP_PASSWORD_LENGTH } from "@dawajin/shared";
import { describe, expect, it } from "vitest";

import { assertGeneratedTemporaryPassword, generateTemporaryPassword } from "./tempPassword";

describe("generateTemporaryPassword", () => {
  it("يولّد بالطول والأبجدية المعتمدَين، ويقبله حارس الشكل", () => {
    for (let i = 0; i < 200; i += 1) {
      const pw = generateTemporaryPassword();
      expect(pw).toHaveLength(TEMP_PASSWORD_LENGTH);
      expect(isGeneratedTemporaryPassword(pw)).toBe(true);
    }
  });

  it("لا يصادم — 2000 توليدة كلها فريدة", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) seen.add(generateTemporaryPassword());
    expect(seen.size).toBe(2000);
  });

  it("يتجنّب المحارف المتشابهة بصريًا (0 O 1 l I)", () => {
    const joined = Array.from({ length: 300 }, () => generateTemporaryPassword()).join("");
    for (const ch of ["0", "O", "1", "l", "I"]) {
      expect(joined).not.toContain(ch);
    }
  });
});

describe("assertGeneratedTemporaryPassword — بوابة القبول", () => {
  it("تقبل المولَّد", () => {
    expect(() => {
      assertGeneratedTemporaryPassword(generateTemporaryPassword());
    }).not.toThrow();
  });

  // الكلمة التي أثبتت الثقب فعليًا (القرار #98) — أول ما يجب أن يُرفض
  it.each(["Temp1234", "123456", "password", "Aa1", "", "ABCDEFGHJKM"])(
    "ترفض الكلمة اليدوية %j",
    (manual) => {
      expect(() => {
        assertGeneratedTemporaryPassword(manual);
      }).toThrow();
    }
  );

  it("ترفض ما طابق الطول وخالف الأبجدية (محارف متشابهة)", () => {
    expect(() => {
      assertGeneratedTemporaryPassword("O0l1IABCDEFG");
    }).toThrow();
  });
});
