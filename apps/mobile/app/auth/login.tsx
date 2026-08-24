import { View, Text, StyleSheet } from "react-native";

import { color, font, spacing, radius } from "@/constants/theme";

/**
 * شاشة تسجيل الدخول — هيكل مؤقت للمرحلة 0 فقط (تثبيت الرموز والتنقّل).
 * النموذج الفعلي (رقم الجوال + كلمة المرور + POST /auth/login) يُبنى في
 * المرحلة 1 مع نواة الخادم (docs/work-plan.md).
 */
export default function LoginScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>دواجن</Text>
        <Text style={styles.subtitle}>نظام إدارة مزارع دواجن التسمين</Text>
        <Text style={styles.note}>شاشة تسجيل الدخول — قيد البناء (المرحلة 1)</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.surfacePage,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing[6] ?? 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: color.surfaceRaised,
    borderRadius: radius.screen,
    borderWidth: 1,
    borderColor: color.borderSubtle,
    padding: spacing[6] ?? 24,
    alignItems: "center",
    gap: spacing[3] ?? 12,
  },
  title: {
    fontSize: font.size.screenTitle,
    fontWeight: String(font.weightBold) as "700",
    color: color.brandPrimary,
    writingDirection: "rtl",
  },
  subtitle: {
    fontSize: font.size.content,
    fontWeight: String(font.weightRegular) as "500",
    color: color.textBody,
    textAlign: "center",
    writingDirection: "rtl",
  },
  note: {
    fontSize: font.size.content,
    color: color.statusInfo,
    textAlign: "center",
    writingDirection: "rtl",
  },
});
