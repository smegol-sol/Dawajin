import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";

import { color, spacing } from "@/constants/theme";

interface AuthScreenProps {
  /** كتلة العنوان أعلى الشاشة — الهوية أو عنوان الشاشة وسطر سياقها. */
  header: ReactNode;
  /** المحتوى: نموذج أو قائمة. */
  children: ReactNode;
  /** الإجراء الأساسي — يُعرض بعد المحتوى مباشرة لا مثبَّتًا في قاع الشاشة. */
  footer?: ReactNode;
  testID?: string;
}

/**
 * تخطيط شاشات المصادقة الثلاث (الدخول · اختيار الحساب · تغيير كلمة المرور).
 *
 * **مصدر واحد للتخطيط** (القرار #96): كان كل شاشة تكرّره في `StyleSheet`
 * الخاص بها، فأُصلح `justifyContent: "space-between"` في شاشة الدخول وحدها
 * وبقي في شاشة تغيير كلمة المرور — إصلاح شاشة لا إصلاح عيب. أي تعديل تخطيط
 * لاحق يقع هنا مرة واحدة ويعمّ الثلاث.
 *
 * **تدفّق من الأعلى بمسافات المقياس، بلا `space-between`**: على شاشة طويلة
 * كان الأخير يوزّع المساحة الفائضة فيبدأ المحتوى قرب المنتصف ويلتصق الزر
 * بالقاع. الزر بعد المحتوى مباشرة أقرب للإبهام فعليًا مما كان في القاع.
 */
export function AuthScreen({ header, children, footer, testID }: AuthScreenProps) {
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      testID={testID}
    >
      {/* شاشات المصادقة بلا ترويسة (القرار #93) وخلفيتها `surfacePage`
          الفاتحة — فأيقونات النظام تحتاج الداكن، عكس ما تحتاجه فوق الترويسة
          الخضراء. ولهذا الضبط لكل سياق لا مرة واحدة على الجذر (القرار #175). */}
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View testID="auth-header">{header}</View>
        {/* مِرساة عامة لتأكيدات التخطيط: تقيس الفجوة بين المحتوى والإجراء
            على أي شاشة مصادقة بلا معرفة ببنيتها الداخلية */}
        <View testID="auth-content">{children}</View>
        {footer === undefined ? null : <View testID="auth-footer">{footer}</View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: color.surfacePage,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    // مسافة من المقياس بين الكتل — لا توزيع للمساحة الفائضة
    gap: spacing.xl,
  },
});
