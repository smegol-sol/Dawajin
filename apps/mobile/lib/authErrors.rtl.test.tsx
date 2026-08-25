import { LOGIN_VALIDATION, loginErrorView } from "@/lib/authErrors";

/**
 * الحالات الأربع المطلوبة على شاشة الدخول — **كل رسالة مختبَرة نصًا**، لا
 * "توجد رسالة". الاختبار هنا على الدالة لا على الشاشة عمدًا: صياغة الرسالة
 * قرار منتج يجب أن ينكسر اختباره صراحة إن تغيّرت، بلا تصيير ولا شبكة.
 *
 * الملف بلاحقة `.rtl.test.tsx` لأن `jest.config.js` يطابق هذه اللاحقة وحدها.
 */

describe("رسائل فشل تسجيل الدخول — الحالات الأربع", () => {
  it("بيانات خاطئة (401) ← رسالة عامة تحت حقل كلمة المرور", () => {
    const view = loginErrorView({ status: 401, code: "invalid_credentials" });
    expect(view.field).toBe("password");
    expect(view.message).toBe("رقم الجوال أو كلمة المرور غير صحيحة");
  });

  it("حساب معطّل (403 account_disabled) ← رسالة تقول ماذا يفعل المستخدم", () => {
    const view = loginErrorView({ status: 403, code: "account_disabled" });
    expect(view.field).toBe("form");
    expect(view.message).toBe("حسابك معطّل — راجع المشرف");
  });

  it("تجاوز المحاولات (429) ← رسالة انتظار صريحة", () => {
    const view = loginErrorView({ status: 429, code: "too_many_attempts" });
    expect(view.field).toBe("form");
    expect(view.message).toBe("محاولات كثيرة — انتظر دقيقة ثم أعد المحاولة");
  });

  it("انقطاع الشبكة (بلا استجابة) ← رسالة تذكر الشبكة لا الخادم", () => {
    const view = loginErrorView({ status: null, code: null });
    expect(view.field).toBe("form");
    expect(view.message).toBe("تعذّر الاتصال بالخادم — تحقّق من الشبكة في العنبر ثم أعد المحاولة");
  });

  it("403 برمز آخر ليس account_disabled ← لا يُقرأ كحساب معطّل", () => {
    // الرمز جزء من الشرط لا الحالة وحدها — 403 من سبب آخر رسالته مختلفة
    const view = loginErrorView({ status: 403, code: "forbidden" });
    expect(view.message).not.toBe("حسابك معطّل — راجع المشرف");
    expect(view.message).toContain("403");
  });

  it("خطأ خادم غير متوقَّع ← يعرض رمز الحالة، لا «حدث خطأ ما»", () => {
    const view = loginErrorView({ status: 500, code: null });
    expect(view.message).toContain("500");
  });

  it("رسائل التحقق المحلي عربية وتحت حقلها", () => {
    expect(LOGIN_VALIDATION.phoneRequired).toBe("أدخل رقم الجوال");
    expect(LOGIN_VALIDATION.passwordRequired).toBe("أدخل كلمة المرور");
  });
});
