import { render } from "@testing-library/react-native";
import type { RenderOptions, RenderResult } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { createElement } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { Metrics } from "react-native-safe-area-context";
import type { ReactTestInstance } from "react-test-renderer";

/**
 * أدوات مساعدة لاختبارات RTL — نقطة العبور الوحيدة من `.props` غير المكتوب
 * (`any` في react-test-renderer) إلى نوع آمن، بدل تكرار `as` في كل اختبار.
 */

/** نمط النص بعد تسويته — يقرأ `style.writingDirection`/`textAlign` بأمان. */
export function textStyleOf(instance: ReactTestInstance): Record<string, unknown> {
  const props = instance.props as { style?: unknown };
  return (StyleSheet.flatten(props.style) as Record<string, unknown> | undefined) ?? {};
}

/** خصائص عنصر (أيقونة عادة) — يقرأ props.style/transform وغيرها بأمان. */
export function propsOf(instance: ReactTestInstance): Record<string, unknown> {
  return instance.props;
}

/**
 * مقاييس ثابتة بمناطق آمنة **صفرية** — `useSafeAreaInsets` يرمي بلا مزوّد
 * (`No safe area value available`)، والقياس الحقيقي غير متاح في
 * `react-test-renderer` أصلًا (لا تخطيط Yoga — القرار #76).
 *
 * **والصفر مقصود لا اختصار:** يبقي كل تأكيد قائم يقيس ما كان يقيسه بالضبط،
 * فلا يتغيّر شيء بإضافة المزوّد. حشو المناطق الآمنة نفسه يُقاس على الجهاز
 * لا هنا (القرار #171).
 */
const ZERO_INSET_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/**
 * `render` مغلَّفًا بـ`SafeAreaProvider` — يلزم كل مكوّن يقرأ المناطق الآمنة
 * (`AppHeader` اليوم). يُستعمل بدل `render` المباشر في اختبارات تلك المكوّنات.
 */
export function renderWithSafeArea(ui: ReactElement, options?: RenderOptions): RenderResult {
  return render(
    createElement(SafeAreaProvider, { initialMetrics: ZERO_INSET_METRICS }, ui),
    options
  );
}
