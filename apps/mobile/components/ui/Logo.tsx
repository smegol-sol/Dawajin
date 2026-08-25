import { StyleSheet, Text, View } from "react-native";

import { color, font, radius, spacing } from "@/constants/theme";

/**
 * **الشعار — المصدر الوحيد في التطبيق كله** (القرار #109).
 *
 * لا شاشة تضمّن الشعار مباشرة: لا SVG داخل شاشة، ولا نسخ مسارات في الكود،
 * ولا كتابة اسم التطبيق نصًا. كل استعمال يمرّ بهذا المكوّن، فتغيير الشعار
 * مستقبلًا **تعديل في هذا الملف وحده لا أكثر**.
 *
 * القاعدة مفروضة آليًا لا بالاتفاق (المبدأ المعماري الأول — الفرض المركزي):
 * فاحص `الشعار مصدر واحد` في `check:all` يفشل البناء عند أي تضمين خارج هنا.
 *
 * **الأشكال الثلاثة كلها مشتقّة من تعريف واحد** أدناه (`BRAND`)، لا ثلاثة
 * تعريفات متوازية — وإلا انحرفت النسخ عن بعضها وهو بالضبط ما يمنعه هذا الملف:
 *
 * - `full` — الشعار الكامل (الرمز + الاسم). شاشات ما قبل الدخول.
 * - `icon` — الرمز وحده، مربّع. الأماكن الضيقة: هيدر، أيقونة، شاشة انتظار.
 * - `mono` — أحادي اللون على خلفية داكنة أو ملوّنة (لا يُستعمل على فاتح).
 *
 * **الشكل الحالي نصّي مؤقتًا** — لا يوجد عمل فني من المصمم بعد. حين يصل،
 * يُستبدَل داخل هذا الملف وحده ولا تُمَس أي شاشة: هذا هو الغرض من المكوّن،
 * ودليل نجاحه أن استبدال العمل الفني لا يظهر في diff أي شاشة.
 */

/**
 * تعريف العلامة الواحد — كل شكل يشتق منه، ولا قيمة مكرَّرة بين الأشكال.
 *
 * **مُصدَّر ليستورده الاختبار** بدل تكرار الاسم حرفيًا فيه: لو كتبه الاختبار
 * نصًا لصار تغيير الاسم تعديلًا في ملفين، وهو نقض للقاعدة التي يحرسها هذا
 * الملف. الفاحص يكشف ذلك فعلًا — وقد كشفه على أول نسخة من الاختبار نفسه.
 */
export const BRAND = {
  name: "دواجن",
  /** الحرف الأول وحده في الشكل المربّع — لا نصّ ثانٍ يُصان بالتوازي. */
  get initial(): string {
    return this.name.charAt(0);
  },
} as const;

export type LogoVariant = "full" | "icon" | "mono";

export function Logo({
  variant = "full",
  testID = "logo",
}: {
  variant?: LogoVariant;
  testID?: string;
}) {
  const onDark = variant === "mono";

  if (variant === "icon" || variant === "mono") {
    return (
      <View
        style={[styles.mark, onDark ? styles.markMono : styles.markBrand]}
        testID={testID}
        accessibilityRole="image"
        accessibilityLabel={BRAND.name}
      >
        <Text style={[styles.markLetter, onDark ? styles.textOnMono : styles.textOnBrand]}>
          {BRAND.initial}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={styles.full}
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={BRAND.name}
    >
      <View style={[styles.mark, styles.markBrand]}>
        <Text style={[styles.markLetter, styles.textOnBrand]}>{BRAND.initial}</Text>
      </View>
      <Text style={styles.wordmark}>{BRAND.name}</Text>
    </View>
  );
}

const MARK_SIZE = 44;

const styles = StyleSheet.create({
  full: {
    alignItems: "center",
    gap: spacing.xs,
  },
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
    borderRadius: radius.control,
    alignItems: "center",
    justifyContent: "center",
  },
  markBrand: {
    backgroundColor: color.brandPrimary,
  },
  // أحادي اللون: الحرف يأخذ لون الخلفية الداكنة تحته، فيظهر مفرَّغًا
  markMono: {
    backgroundColor: color.textOnDark,
  },
  markLetter: {
    fontSize: font.size.subtitle,
    fontFamily: font.familyBold,
    writingDirection: "rtl",
  },
  textOnBrand: {
    color: color.textOnDark,
  },
  textOnMono: {
    color: color.brandPrimary,
  },
  wordmark: {
    fontSize: font.size.screenTitle,
    fontFamily: font.familyBold,
    color: color.brandPrimary,
    writingDirection: "rtl",
  },
});
