import { describe, expect, it } from "vitest";

import { translatePgError } from "./pgErrors";

/**
 * ترجمة 23505 — **مسار الفهرس الفريد**، وهو الحارس الأخير خلف الفحص المسبق
 * في طبقة الخدمة (القرار #119).
 *
 * يُختبَر هنا بالوحدة لا بالتكامل عمدًا: بلوغ الفهرس فعليًا يحتاج **تزامنًا
 * حقيقيًا** (طلبان بنفس الاسم في اللحظة نفسها)، وهو ما لا يُستدعى بثبات في
 * اختبار. أما المترجِم فيُستدعى بخطأ pg مُصطنع فيُفحص بيقين.
 *
 * والعيب الذي أوجب هذا الاختبار انكشف **بتعطيل الفحص المسبق عمدًا** لا بسقوط
 * اختبار — لأن الاختبارات كلها كانت تمرّ بالمسار الأول فلا تبلغ الثاني قط.
 */
function pgUniqueViolation(constraint: string): unknown {
  return { code: "23505", constraint, table: "irrelevant" };
}

describe("ترجمة انتهاك الفهرس الفريد", () => {
  it.each([
    ["sites_tenant_name_uq", "يوجد موقع بهذا الاسم"],
    ["farms_site_name_uq", "توجد مزرعة بهذا الاسم في هذا الموقع"],
  ])("%s ← duplicate_name بنفس رسالة الفحص المسبق", (constraint, message) => {
    const error = translatePgError(pgUniqueViolation(constraint));
    expect(error?.status).toBe(409);
    expect(error?.code).toBe("duplicate_name");
    expect(error?.message).toBe(message);
  });

  it("قيد بلا رمز مخصَّص يبقى على duplicate — لا يتغيّر سلوك القيود القائمة", () => {
    const error = translatePgError(pgUniqueViolation("users_tenant_phone_uq"));
    expect(error?.code).toBe("duplicate");
    expect(error?.message).toContain("رقم الجوال");
  });

  it("قيد غير معروف ← رسالة عامة لا انهيار", () => {
    const error = translatePgError(pgUniqueViolation("constraint_unknown_here"));
    expect(error?.status).toBe(409);
    expect(error?.code).toBe("duplicate");
  });

  it("خطأ ليس 23505 ← null، فيمرّ لمعالج الأخطاء العام", () => {
    expect(translatePgError({ code: "23503" })).toBeNull();
    expect(translatePgError(null)).toBeNull();
  });
});
