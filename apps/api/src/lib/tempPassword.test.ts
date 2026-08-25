import {
  formatTemporaryPassword,
  isGeneratedTemporaryPassword,
  normalizeTemporaryPassword,
  TEMP_PASSWORD_LENGTH,
} from "@dawajin/shared";
import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

import {
  assertGeneratedTemporaryPassword,
  generateTemporaryPassword,
  verifyPasswordAllowingTempFormat,
} from "./tempPassword";

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

describe("التقسيم بالشرطات — العرض والتطبيع (القرار #105)", () => {
  it("formatTemporaryPassword يقسّم لثلاث كتل رباعية", () => {
    const pw = generateTemporaryPassword();
    const shown = formatTemporaryPassword(pw);
    expect(shown).toMatch(/^.{4}-.{4}-.{4}$/);
    expect(normalizeTemporaryPassword(shown)).toBe(pw);
  });

  it("العشوائية لا تتأثر — الشكل القانوني يبقى 12 محرفًا بلا شرطة", () => {
    for (let i = 0; i < 50; i += 1) {
      const pw = generateTemporaryPassword();
      expect(pw).toHaveLength(TEMP_PASSWORD_LENGTH);
      expect(pw).not.toContain("-");
    }
  });

  it("بوابة القبول تقبل الشكلين", () => {
    const pw = generateTemporaryPassword();
    expect(isGeneratedTemporaryPassword(pw)).toBe(true);
    expect(isGeneratedTemporaryPassword(formatTemporaryPassword(pw))).toBe(true);
  });
});

describe("verifyPasswordAllowingTempFormat — تسامح مقيَّد بالشكل", () => {
  it("يقبل الكلمة المؤقتة مكتوبةً بالشرطات رغم أن المخزَّن بلا شرطات", async () => {
    const pw = generateTemporaryPassword();
    const hash = await bcrypt.hash(pw, 4);
    expect(await verifyPasswordAllowingTempFormat(pw, hash)).toBe(true);
    expect(await verifyPasswordAllowingTempFormat(formatTemporaryPassword(pw), hash)).toBe(true);
  });

  it("لا يمسّ كلمة مرور يختارها المستخدم وتحوي شرطة", async () => {
    const chosen = "my-secret-pass";
    const hash = await bcrypt.hash(chosen, 4);
    expect(await verifyPasswordAllowingTempFormat(chosen, hash)).toBe(true);
    // الصيغة بلا شرطات ليست كلمته، ولا يجوز أن تُقبل
    expect(await verifyPasswordAllowingTempFormat("mysecretpass", hash)).toBe(false);
  });

  it("يرفض كلمة خاطئة بالشكلين", async () => {
    const hash = await bcrypt.hash(generateTemporaryPassword(), 4);
    expect(await verifyPasswordAllowingTempFormat(generateTemporaryPassword(), hash)).toBe(false);
    expect(
      await verifyPasswordAllowingTempFormat(
        formatTemporaryPassword(generateTemporaryPassword()),
        hash
      )
    ).toBe(false);
  });
});
