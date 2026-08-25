import { render, screen } from "@testing-library/react-native";

import { BRAND, Logo } from "@/components/ui/Logo";
import { textStyleOf } from "@/test-utils/rtl";

/**
 * الشعار — المصدر الوحيد (القرار #109). الاختبار على **عقد المكوّن** لا على
 * شكله: الأشكال الثلاثة تُعرض، ولها كلها اسم وصول واحد، والحرف المختصر
 * **مشتقّ** من الاسم لا مكتوب بالتوازي.
 *
 * الاسم يُستورد من `Logo.tsx` ولا يُكتب هنا حرفيًا: كتابته تجعل تغيير العلامة
 * تعديلًا في ملفين — نقضًا للقاعدة نفسها. (الفاحص كشف هذا على أول نسخة من
 * هذا الملف.)
 *
 * لا اختبار ألوان أو مسافات (حدّ بقية اختبارات RTL)، ولا لقطة: العمل الفني
 * سيُستبدَل، ولقطةٌ تفشل عند كل تغيير مقصود تُدرَّب على التحديث الأعمى.
 */
describe("الشعار", () => {
  it.each(["full", "icon", "mono"] as const)("الشكل %s يُعرض", (variant) => {
    render(<Logo variant={variant} />);
    expect(screen.getByTestId("logo")).toBeTruthy();
  });

  it("الشكل الافتراضي هو الكامل — الاسم ظاهر بلا تمرير خاصية", () => {
    render(<Logo />);
    expect(screen.getByText(BRAND.name)).toBeTruthy();
  });

  it("الشكلان المختصران يعرضان الحرف الأول لا الاسم كاملًا", () => {
    render(<Logo variant="icon" />);
    expect(screen.getByText(BRAND.initial)).toBeTruthy();
    expect(screen.queryByText(BRAND.name)).toBeNull();
  });

  it("الحرف المختصر مشتقّ من الاسم لا مكتوب بالتوازي", () => {
    // لو كُتب الحرف يدويًا لأمكن أن ينحرف عن الاسم عند تغييره
    expect(BRAND.initial).toBe(BRAND.name.charAt(0));
    expect(BRAND.initial).toHaveLength(1);
  });

  it("اسم الوصول هو اسم العلامة في كل شكل — لا يعتمد على النص المعروض", () => {
    render(<Logo variant="mono" />);
    expect(screen.getByTestId("logo").props.accessibilityLabel).toBe(BRAND.name);
  });

  it("النصّ باتجاه rtl (§10 قاعدة 4)", () => {
    render(<Logo variant="full" />);
    expect(textStyleOf(screen.getByText(BRAND.name)).writingDirection).toBe("rtl");
  });

  it("testID قابل للتخصيص ليُميَّز أكثر من شعار في شاشة واحدة", () => {
    render(<Logo variant="icon" testID="header-logo" />);
    expect(screen.getByTestId("header-logo")).toBeTruthy();
  });
});
