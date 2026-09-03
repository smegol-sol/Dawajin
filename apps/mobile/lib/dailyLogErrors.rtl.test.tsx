import { DailyLogRequestError } from "@/lib/dailyLogApi";
import { dailyLogErrorMessage } from "@/lib/dailyLogErrors";

/**
 * **نصوصُ فشل شاشة السجل اليوميّ** — **تُكتب بالرمز لا تُنقَل من الخادم
 * خامًا**، فكلُّ نصٍّ هنا قرارُ منتج يقرؤه المربّي (نمط `infrastructureErrors`).
 */
function failure(status: number | null, code: string | null): DailyLogRequestError {
  return new DailyLogRequestError({ status, code });
}

describe("رسالة فشل السجل اليوميّ", () => {
  it("انقطاعُ الشبكة يُقال شبكةً لا عطبَ خادم", () => {
    expect(dailyLogErrorMessage(failure(null, null))).toBe(
      "تعذّر الاتصال بالخادم — تحقّق من الشبكة ثم أعد المحاولة"
    );
  });

  it("والحالات المعروفة كلٌّ بنصّها", () => {
    expect(dailyLogErrorMessage(failure(401, null))).toBe("انتهت الجلسة — سجّل الدخول من جديد");
    expect(dailyLogErrorMessage(failure(403, null))).toBe("لم يعد هذا العنبر ضمن ما أُسند إليك");
    expect(dailyLogErrorMessage(failure(404, null))).toBe("لم يعد موجودًا — ربما حُذف");
  });

  it("و409 واقعةٌ متوقَّعة لا عطب — سجّل صباحًا وعاد مساءً", () => {
    expect(dailyLogErrorMessage(failure(409, "duplicate"))).toBe(
      "سجل اليوم محفوظ بالفعل — لا يُسجَّل يومان لنفس الدفعة"
    );
  });

  it("و422 برمزٍ معروف يُسمّى، وبرمزٍ مجهول يُقال رفضًا لا عطبًا", () => {
    expect(dailyLogErrorMessage(failure(422, "no_active_batch"))).toBe(
      "لم تعد في عنبرك دفعة نشطة — أعد فتح الشاشة"
    );
    expect(dailyLogErrorMessage(failure(422, "product_not_feed"))).toBe(
      "الصنف المختار ليس علفًا بوحدة الكيس"
    );
    expect(dailyLogErrorMessage(failure(422, "product_missing_package_size"))).toBe(
      "صنف العلف بلا وزن عبوة — راجع مشرفك"
    );
    expect(dailyLogErrorMessage(failure(422, "sample_pair_required"))).toBe(
      "عيّنة الوزن رقمان معًا: عدد الطيور ووزنها"
    );
    expect(dailyLogErrorMessage(failure(422, "house_without_tank_capacity"))).toBe(
      "العنبر بلا سعة خزان — فالماء لا يُسجَّل فيه"
    );
    expect(dailyLogErrorMessage(failure(422, "شيء_لا_نعرفه"))).toBe("رُفض الطلب — راجع ما أدخلته");
    expect(dailyLogErrorMessage(failure(422, null))).toBe("رُفض الطلب — راجع ما أدخلته");
  });

  it("وما ليس فشلَ طلبٍ أصلًا يُقال عامًّا ولا يُنسب إلى الشبكة", () => {
    expect(dailyLogErrorMessage(new Error("شيء آخر"))).toBe("تعذّر تنفيذ الطلب — أعد المحاولة");
    expect(dailyLogErrorMessage(failure(500, null))).toBe("تعذّر تنفيذ الطلب — أعد المحاولة");
  });
});
