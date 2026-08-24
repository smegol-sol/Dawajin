import { render, screen } from "@testing-library/react-native";
import { Check } from "lucide-react-native";

import { Chip } from "@/components/ui/Chip";
import { propsOf } from "@/test-utils/rtl";

/**
 * قاعدتا RTL #3 و#7 (docs/app-complete-spec.md §10): "علامة الصح لا تُعكس
 * — اتجاهها ثابت" و"اختبار الأسماء الطويلة والقصيرة في نفس المكوّن".
 * لا snapshot ولا اختبار ألوان/مسافات.
 */
describe("Chip — قاعدة RTL: علامة الصح غير معكوسة، وأسماء متغيّرة الطول", () => {
  it("عند التحديد: علامة الصح تظهر بلا أي تحويل (transform) يعكس اتجاهها", () => {
    render(<Chip label="حادث" selected onPress={() => undefined} />);
    const check = propsOf(screen.UNSAFE_getByType(Check));
    // أي style/transform يقلب المحور الأفقي (scaleX سالب) يعني عكس علامة
    // الصح — يجب ألا يوجد على الإطلاق، لا هنا ولا بأي قيمة سالبة.
    expect(check.style).toBeUndefined();
    expect(check.transform).toBeUndefined();
  });

  it("عند عدم التحديد: لا تظهر علامة الصح إطلاقًا", () => {
    render(<Chip label="حادث" selected={false} onPress={() => undefined} />);
    expect(screen.UNSAFE_queryByType(Check)).toBeNull();
  });

  it("اسم قصير واسم طويل في نفس المكوّن — كلاهما نص عربي حقيقي لا Lorem Ipsum", () => {
    render(
      <>
        <Chip label="حادث" selected={false} onPress={() => undefined} />
        <Chip label="مشاكل مياه/علف" selected={false} onPress={() => undefined} />
      </>
    );
    expect(screen.getByText("حادث")).toBeTruthy();
    expect(screen.getByText("مشاكل مياه/علف")).toBeTruthy();
  });
});
