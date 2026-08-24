import { StyleSheet, View } from "react-native";

import { color, component, radius } from "@/constants/theme";

export type ProgressTone = "success" | "warning" | "critical";

const TONE_COLOR: Record<ProgressTone, string> = {
  success: color.accentSuccess,
  warning: color.statusWarning,
  critical: color.statusCritical,
};

/**
 * شريط التقدّم — ارتفاع 10 · ثلاث حالات لونية · بسقف مرجعي
 * (docs/app-complete-spec.md §8.15). السقف مرجعي لا امتلاء دائم — تغطية
 * العلف مثلًا سقفها 14 يومًا فلا يمتلئ الشريط في أغلب الحالات الطبيعية.
 */
export function ProgressBar({
  value,
  ceiling,
  tone,
}: {
  value: number;
  ceiling: number;
  tone: ProgressTone;
}) {
  const fraction = ceiling > 0 ? Math.min(1, Math.max(0, value / ceiling)) : 0;

  return (
    <View style={styles.track}>
      <View
        style={[styles.fill, { width: `${fraction * 100}%`, backgroundColor: TONE_COLOR[tone] }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: component.progressBar.height,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSunken,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
  },
});
