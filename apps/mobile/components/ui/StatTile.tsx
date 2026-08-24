import { Minus, TrendingDown, TrendingUp } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { color, font, spacing } from "@/constants/theme";

export type StatTrend = "up" | "down" | "flat";

const TREND_ICON = { up: TrendingUp, down: TrendingDown, flat: Minus } as const;

interface StatTileProps {
  label: string;
  /** القيمة — نص لأنها قد تحمل فاصلة عشرية أو رمزًا بالفعل (مثل "1.72"). */
  value?: string | number;
  unit?: string;
  /** القيمة المعيارية للمقارنة (§8.4، §11: "المقارنة بالمعيار بجانب كل مؤشر"). */
  standardValue?: string;
  trend?: StatTrend;
  /**
   * سبب غياب القيمة — إلزامي عند عدم توفّر value (§11: "لا شرطة صامتة
   * لمؤشر غير محسوب — يُعرض سبب غيابه").
   */
  unavailableReason?: string;
  tone?: "success" | "warning" | "critical";
}

const TONE_COLOR = {
  success: color.accentSuccess,
  warning: color.statusWarning,
  critical: color.statusCritical,
} as const;

/** StatTile — تسمية · قيمة · وحدة · معيار · اتجاه (docs/app-complete-spec.md §8.4). */
export function StatTile({
  label,
  value,
  unit,
  standardValue,
  trend,
  unavailableReason,
  tone,
}: StatTileProps) {
  const TrendIcon = trend ? TREND_ICON[trend] : null;
  const valueColor = tone ? TONE_COLOR[tone] : color.brandPrimary;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {value !== undefined ? (
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
          {unit ? <Text style={styles.unit}>{unit}</Text> : null}
          {TrendIcon ? <TrendIcon color={valueColor} size={16} /> : null}
        </View>
      ) : (
        <Text style={styles.unavailable}>{unavailableReason}</Text>
      )}
      {standardValue ? <Text style={styles.standard}>المعيار: {standardValue}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minWidth: 96,
    gap: spacing.xxs,
  },
  label: {
    fontSize: font.size.technicalRef,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xxs,
  },
  value: {
    fontSize: font.size.indicatorValue,
    fontFamily: font.familyNumber,
    writingDirection: "ltr",
  },
  unit: {
    fontSize: font.size.technicalRef,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
  },
  unavailable: {
    fontSize: font.size.technicalRef,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
  },
  standard: {
    fontSize: font.size.technicalRef,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
  },
});
