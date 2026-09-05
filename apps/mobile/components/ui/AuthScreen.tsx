import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
 *
 * ## والمناطق الآمنة هنا لا في `AppHeader` وحدها (القرار 291)
 *
 * **إصلاح القرار 171 وُضع في `AppHeader` وشريط التبويبات** — **وهاتان
 * الشاشاتُ الأربع لا تحمل `AppHeader` بقرارٍ صريح** (#93 و#87: «شاشات
 * المصادقة بلا ترويسة») — **فبقيت خارج الإصلاح**.
 *
 * **ورآه المالك على جهازه:** عنوانُ «تغيير كلمة المرور» مدفونٌ تحت شريط
 * الحالة — **حشوٌ ثابت `20` مقابل شريطِ حالةٍ ‏‎≈38.6dp‎‏ على جهازه**.
 *
 * **ولا تراه بوابةٌ ولا تأكيدُ تخطيط:** المخرَجُ ويبٌ **بلا شريط حالة ولا
 * شريط تنقّل**، **فالحشوُ صفرٌ هناك مهما كان الكود** — وهو نفسُ عمى 171.
 * **فشاهدُه اختبارُ وحدةٍ بمقاييسَ غيرِ صفرية، لا تأكيدُ تخطيط.**
 */
export function AuthScreen({ header, children, footer, testID }: AuthScreenProps) {
  // **يُضاف إلى حشو المقياس ولا يستبدله** — نفسُ ما فعله `AppHeader` في 171
  const insets = useSafeAreaInsets();
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
      <ScrollView
        // **مِرساةٌ لشاهد المناطق الآمنة** — يُقرأ منها `contentContainerStyle`
        // (القرار 291)، كما تُقرأ المراسي الثلاث أدناه لتأكيدات التخطيط
        testID="auth-scroll"
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: spacing.xl + insets.top, paddingBottom: spacing.xxl + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
      >
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
    // **القيمتان أساسٌ يُضاف إليه حشوُ المناطق الآمنة أعلاه** (القرار 291)
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    // مسافة من المقياس بين الكتل — لا توزيع للمساحة الفائضة
    gap: spacing.xl,
  },
});
