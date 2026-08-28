import { StyleSheet, Text, View } from "react-native";

import { color, component, font, radius, spacing } from "@/constants/theme";

/**
 * شريط توزيع الحالات — «ملخص حالة عنابرها» في §5-د/2.
 *
 * **شريط لا عدّادات:** ثلاثة مؤشّرات `StatTile` كانت تطلب `336×3 + 56×2 = 1120`
 * بكسل في متاح ≈`1034`، فتلتفّ إلى `2+1` — لا شبكة 2×2 ولا صفّ من 3 كما تشترط
 * §8.4. والشريط يعرض التوزيع في سطر واحد بلا عدّادات، فيزول الفائض ويطابق
 * النصّ معًا.
 *
 * **والاسم `StatusDistributionBar` لا `StatusBar`** — الأخير مستورد من
 * `expo-status-bar` في `AppHeader` و`AuthScreen` (القرار #175)، والتشابه
 * يُنتج استيرادًا خاطئًا لا يمسكه المترجِم لأن كليهما مكوّن صالح.
 */

/** أقسام التوزيع — بترتيب العرض من اليمين (بدء القراءة) إلى اليسار. */
const SEGMENTS = [
  { key: "occupied" as const, label: "مشغول", tone: color.statusInfo },
  { key: "ready" as const, label: "جاهز وشاغر", tone: color.accentSuccess },
  { key: "other" as const, label: "غير ذلك", tone: color.statusWarning },
];

export interface StatusDistribution {
  occupied: number;
  ready: number;
  other: number;
}

export function StatusDistributionBar({
  counts,
  emptyLabel,
  testID,
}: {
  counts: StatusDistribution;
  /** يُعرض حين لا عنابر إطلاقًا — §11: «لا شرطة صامتة، يُعرض سبب غيابه». */
  emptyLabel: string;
  testID?: string;
}) {
  const total = counts.occupied + counts.ready + counts.other;

  // شريط رمادي فارغ يوحي بتوزيع معدوم لا بغياب عنابر — وهو «شرطة صامتة»
  // بشكل آخر (§11). فالنصّ الصريح مكانه، ولا يُخفى الموضع بلا بيان.
  if (total === 0) {
    return (
      <Text style={styles.empty} testID={testID ? `${testID}-empty` : undefined}>
        {emptyLabel}
      </Text>
    );
  }

  return (
    <View testID={testID}>
      <View style={styles.bar}>
        {SEGMENTS.filter((s) => counts[s.key] > 0).map((s) => (
          <View
            key={s.key}
            testID={testID ? `${testID}-${s.key}` : undefined}
            style={[styles.segment, { flex: counts[s.key], backgroundColor: s.tone }]}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {SEGMENTS.filter((s) => counts[s.key] > 0).map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: s.tone }]} />
            <Text style={styles.legendText}>
              {s.label} {counts[s.key]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    height: component.progressBar.height,
    borderRadius: radius.small,
    overflow: "hidden",
    gap: 2,
  },
  segment: {
    height: "100%",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  legendText: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
  },
  empty: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "right",
  },
});
