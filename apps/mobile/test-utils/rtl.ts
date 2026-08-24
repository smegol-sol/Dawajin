import { StyleSheet } from "react-native";
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
