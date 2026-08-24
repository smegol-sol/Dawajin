import { render, screen } from "@testing-library/react-native";
import { ArrowRight } from "lucide-react-native";

import { AppHeader } from "@/components/ui/AppHeader";
import { textStyleOf } from "@/test-utils/rtl";

const LONG_TITLE = "عنبر رقم أربعة عشر - الجناح الشرقي الملحق بمزرعة الوادي الأخضر";
const SHORT_TITLE = "عنبر 1";

/**
 * قواعد RTL #4 و#7 (docs/app-complete-spec.md §10): عنوان الشاشة محاذاته
 * يمين حصرًا، اختبار الأسماء الطويلة والقصيرة في نفس المكوّن. لا snapshot
 * ولا اختبار ألوان/مسافات.
 *
 * **قاعدة #1 (سهم الرجوع يشير يمينًا) خارج نطاق هذه البنية فعليًا — راجع
 * docs/work-plan.md §7-ب:** الاختبار أدناه يتحقق فقط من *نوع* أيقونة السهم
 * (ArrowRight — اتجاه رأسه الرسومي)، لا من *موضعها* على الشاشة. حتى لو
 * فُرض RTL هنا، `react-test-renderer` (محرّك @testing-library/react-native،
 * القرار #76) لا يُنفّذ تخطيط Yoga فعليًا فلا توجد إحداثيات x/y ليُستعلَم
 * عنها — قيد بنيوي لا عيب في هذا الاختبار بعينه. تحقُّق الموضع الفعلي يحتاج
 * محرّك تخطيط حقيقي (Playwright/متصفح)، غير مبني بعد.
 */
describe("AppHeader — قواعد RTL: نوع أيقونة الرجوع والعنوان يمين حصرًا", () => {
  it("المتغيّر الفرعي: أيقونة الرجوع من نوع ArrowRight (لا موضعها على الشاشة — انظر التعليق أعلاه)", () => {
    render(<AppHeader variant="sub" title={SHORT_TITLE} />);
    expect(screen.UNSAFE_getByType(ArrowRight)).toBeTruthy();
  });

  it("عنوان قصير: محاذاة العنوان يمين", () => {
    render(<AppHeader variant="main" title={SHORT_TITLE} />);
    const style = textStyleOf(screen.getByText(SHORT_TITLE));
    expect(style.textAlign).toBe("right");
  });

  it("عنوان طويل في نفس المكوّن: يظل نصًا عربيًا حقيقيًا ومحاذاته يمين أيضًا", () => {
    render(<AppHeader variant="sub" title={LONG_TITLE} contextLine="سياق إضافي" />);
    const style = textStyleOf(screen.getByText(LONG_TITLE));
    expect(style.textAlign).toBe("right");
  });
});
