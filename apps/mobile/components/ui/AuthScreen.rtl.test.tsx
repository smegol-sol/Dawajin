import { screen } from "@testing-library/react-native";
import { StyleSheet, Text } from "react-native";

import { AuthScreen } from "./AuthScreen";

import { propsOf, renderWithDeviceInsets, renderWithSafeArea } from "@/test-utils/rtl";

/**
 * **المناطق الآمنة في شاشات المصادقة الأربع** (القرار 291).
 *
 * **وعلّةُ وجود هذا الملف أن ما تحته لا يراه شيءٌ آخر:** تأكيداتُ التخطيط
 * تعمل على مخرَج الويب — **ولا شريطَ حالةٍ في المتصفح ولا شريطَ تنقّل** —
 * **فالحشوُ صفرٌ هناك مهما كان الكود**. **وهو نفسُ عمى القرار 171.**
 *
 * **والعطبُ رآه المالك على جهازه:** عنوانُ «تغيير كلمة المرور» مدفونٌ تحت
 * شريط الحالة. **وإصلاحُ 171 كان في `AppHeader`، والشاشاتُ الأربع بلا
 * ترويسة بقرارٍ صريح — فبقيت خارجه.**
 *
 * **واتجاهُ خطئه معلَن (القرار 270): يمرّ ظلمًا على كل ما ليس حشوًا علويًّا
 * أو سفليًّا في هذا المكوّن** — **لا يقيس موضعَ النصّ على الشاشة ولا تداخلَه
 * فعلًا**، **فذلك يلزمه تخطيطُ Yoga** (§7-ب البند 37). **ولا يفشل ظلمًا.**
 */

/** يقرأ `contentContainerStyle` من مِرساة التمرير — **لا من الجذر**. */
function scrollPadding(): { top: unknown; bottom: unknown } {
  const props = propsOf(screen.getByTestId("auth-scroll")) as { contentContainerStyle?: unknown };
  const style = (StyleSheet.flatten(props.contentContainerStyle) ?? {}) as Record<string, unknown>;
  return { top: style.paddingTop, bottom: style.paddingBottom };
}

describe("AuthScreen — حشو المناطق الآمنة", () => {
  /**
   * **الشاهد الذي يفرّق** — **والصفرُ لا يفرّق**: `renderWithSafeArea` بمقاييسَ
   * صفرية **يخضرّ ولو أُسقط الحشو كلُّه**، وهو ما جعل العطب يمرّ حتى رآه المالك.
   */
  it("**بمقاييس الجهاز: الحشو العلويّ والسفليّ يزيدان بمقدار المنطقة الآمنة**", () => {
    renderWithDeviceInsets(
      <AuthScreen header={<Text>عنوان</Text>}>
        <Text>محتوى</Text>
      </AuthScreen>
    );

    // 20 (spacing.xl) + 38 · و24 (spacing.xxl) + 39 — الأرقام من جهاز المالك
    expect(scrollPadding()).toEqual({ top: 58, bottom: 63 });
  });

  /**
   * **وبلا مناطق آمنة يبقى الأساس كما هو** — **فالحشو مُضافٌ لا مستبدَل**،
   * وهو ما يمنع أن يقفز التخطيط على جهازٍ بلا حوافّ.
   */
  it("وبمقاييس صفرية يبقى حشو المقياس وحده", () => {
    renderWithSafeArea(
      <AuthScreen header={<Text>عنوان</Text>}>
        <Text>محتوى</Text>
      </AuthScreen>
    );

    expect(scrollPadding()).toEqual({ top: 20, bottom: 24 });
  });
});
