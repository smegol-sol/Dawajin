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

/**
 * **الخطأ المغلَّف — والعطب الذي أسقط خمسة اختبارات عند ترقية drizzle** (القرار
 * 216).
 *
 * `drizzle-orm` منذ 0.45 يرمي `DrizzleQueryError` **ويضع خطأ `pg` في `cause`**
 * — **فقراءة الرمز من الخطأ المرميّ وحده تجده `undefined`**، فيسقط 23505 من
 * التعرّف ويصير 500 بدل 409.
 *
 * **ويُختبر الشكلان معًا لا الجديد وحده:** الخام (ما قبل الترقية) والمغلَّف (ما
 * بعدها) — **فالدالة تعمل في الحالتين، ولا تُكسر بعودةٍ إلى الخلف ولا بغلافٍ
 * ثالث**. **وهذه الاختبارات هي ما كان سيمسك العطب قبل أن يمسكه التكامل.**
 */
function drizzleWrapped(inner: unknown): unknown {
  const wrapper = new Error("Failed query") as Error & { cause?: unknown };
  wrapper.cause = inner;
  return wrapper;
}

describe("الخطأ المغلَّف في سلسلة cause", () => {
  it("خطأ pg خام ← 409 (ما قبل الترقية)", () => {
    const error = translatePgError(pgUniqueViolation("sites_tenant_name_uq"));
    expect(error?.status).toBe(409);
    expect(error?.details).toMatchObject({ constraint: "sites_tenant_name_uq" });
  });

  it("مغلَّف بغلاف واحد ← 409 بنفس القيد والرسالة", () => {
    const error = translatePgError(drizzleWrapped(pgUniqueViolation("sites_tenant_name_uq")));
    expect(error?.status).toBe(409);
    expect(error?.code).toBe("duplicate_name");
    expect(error?.message).toBe("يوجد موقع بهذا الاسم");
    expect(error?.details).toMatchObject({ constraint: "sites_tenant_name_uq" });
  });

  it("مغلَّف بغلافين ← 409، فالبحث سلسلة لا مستوى واحد", () => {
    const error = translatePgError(
      drizzleWrapped(drizzleWrapped(pgUniqueViolation("farms_site_name_uq")))
    );
    expect(error?.status).toBe(409);
    expect(error?.message).toBe("توجد مزرعة بهذا الاسم في هذا الموقع");
  });

  it("انتهاك الاستبعاد 23P01 مغلَّفًا ← 409 كذلك", () => {
    const inner = { code: "23P01", constraint: "user_assignments_farm_period_ex", table: "x" };
    expect(translatePgError(drizzleWrapped(inner))?.status).toBe(409);
  });

  it("غلافٌ بلا خطأ pg في سلسلته ← null، فلا 409 يُخترع", () => {
    expect(translatePgError(drizzleWrapped(new Error("لا علاقة")))).toBeNull();
    expect(translatePgError(drizzleWrapped(undefined))).toBeNull();
  });

  it("غلافٌ يحمل رمزًا غير SQLSTATE ← يُتجاوَز ولا يُنهي البحث", () => {
    // **أخطاء Node تحمل `code` نصيًّا** (`ECONNRESET`) **ومكتبات تضع
    // `ERR_…`** — **فشرطُ «أول `code` نصيّ» يتوقّف عند الغلاف** فلا يبلغ خطأ
    // `pg` تحته، **فيعود 500 بدل 409 — وهو العطب نفسه من باب آخر**.
    const wrapper = new Error("socket hang up") as Error & { code?: string; cause?: unknown };
    wrapper.code = "ECONNRESET";
    wrapper.cause = pgUniqueViolation("sites_tenant_name_uq");

    const error = translatePgError(wrapper);
    expect(error?.status).toBe(409);
    expect(error?.details).toMatchObject({ constraint: "sites_tenant_name_uq" });
  });

  it("سلسلة دائرية ← null لا دوران لا نهائي", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    const b = new Error("b") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    expect(translatePgError(a)).toBeNull();
  });
});
