import { InfrastructureRequestError } from "@/lib/infrastructureApi";
import { infrastructureErrorMessage } from "@/lib/infrastructureErrors";

/**
 * رسالة كل فشل — **قرار منتج لا تفصيل تقني**: الفرق بين «لم يعد لك» و«لم يعد
 * موجودًا» يقرؤه المستخدم في الميدان ويتصرف عليه.
 */
function failure(status: number | null): InfrastructureRequestError {
  return new InfrastructureRequestError({ status, code: null });
}

describe("رسائل فشل تحميل البنية التحتية", () => {
  it("لا شبكة ← تذكر الشبكة لا الخادم", () => {
    expect(infrastructureErrorMessage(failure(null))).toContain("الشبكة");
  });

  it("403 ← حالة إسناد لا انهيار، وتوجّه لمكان يعمل", () => {
    expect(infrastructureErrorMessage(failure(403))).toBe(
      "لم يعد هذا ضمن ما أُسند إليك — عد للقائمة السابقة"
    );
  });

  it("404 ← «لم يعد موجودًا»، مفصولة عن 403 عمدًا", () => {
    expect(infrastructureErrorMessage(failure(404))).toBe("لم يعد موجودًا — ربما حُذف");
  });

  it("401 ← الجلسة لا البيانات", () => {
    expect(infrastructureErrorMessage(failure(401))).toContain("الجلسة");
  });

  it("500 ← رسالة عامة قابلة لإعادة المحاولة", () => {
    expect(infrastructureErrorMessage(failure(500))).toBe("تعذّر تحميل البيانات — أعد المحاولة");
  });

  it("خطأ ليس من هذه الطبقة إطلاقًا ← نفس الرسالة العامة لا انهيار", () => {
    expect(infrastructureErrorMessage(new Error("شيء آخر"))).toBe(
      "تعذّر تحميل البيانات — أعد المحاولة"
    );
  });
});
