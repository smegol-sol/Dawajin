import { View, Text, StyleSheet } from "react-native";
import { color, font, spacing } from "@/constants/theme";

/**
 * شاشة نائبة مؤقتة — تثبت مسار التنقّل فقط. تُستبدل بالتصميم الفعلي حسب
 * ترتيب المراحل في docs/work-plan.md (المربي ← المشرف ← المالك ← الطبيب).
 */
export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.note}>قيد البناء</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.surfacePage,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2] ?? 10,
  },
  title: {
    fontSize: font.size.screenTitle,
    fontWeight: "700",
    color: color.brandPrimary,
    writingDirection: "rtl",
  },
  note: {
    fontSize: font.size.content,
    color: color.textBody,
    writingDirection: "rtl",
  },
});
