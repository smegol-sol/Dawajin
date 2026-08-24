import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { border, color, font, radius, spacing, statusDerived } from "@/constants/theme";

export type BadgeTone = "success" | "warning" | "critical" | "info";

const TONE_COLOR: Record<BadgeTone, string> = {
  success: color.accentSuccess,
  warning: color.statusWarning,
  critical: color.statusCritical,
  info: color.statusInfo,
};

/**
 * شارة الحالة (docs/app-complete-spec.md §8.1) — لون + أيقونة + نص معًا
 * دائمًا. ممنوع الاعتماد على اللون وحده (§11: عمى الألوان شائع بين الرجال).
 */
export function Badge({
  tone,
  icon: Icon,
  label,
}: {
  tone: BadgeTone;
  icon: LucideIcon;
  label: string;
}) {
  const derived = statusDerived[tone];
  const toneColor = TONE_COLOR[tone];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: derived.background, borderColor: derived.border },
      ]}
    >
      <Icon color={toneColor} size={13} strokeWidth={2.5} />
      <Text style={[styles.label, { color: toneColor }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    borderWidth: border.badge,
  },
  label: {
    fontSize: font.size.badge,
    fontFamily: font.familyBold,
    writingDirection: "rtl",
  },
});
