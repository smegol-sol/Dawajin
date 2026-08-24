import { StyleSheet, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";

import { color } from "@/constants/theme";

/**
 * نمط الرسم البياني — منحنى واحد لكل تقرير: الفعلي (خط متصل أخضر 3px)
 * مقابل المعياري (خط متقطع رمادي 2.5px)، بلا محاور أو زخرفة إضافية
 * (docs/app-complete-spec.md §8.16). لا ثلاثة رسوم في شاشة واحدة — هذا
 * المكوّن يعرض تقريرًا واحدًا فقط بتصميمه.
 */
export function Chart({
  actual,
  standard,
  height = 160,
}: {
  actual: number[];
  standard: number[];
  height?: number;
}) {
  const all = [...actual, ...standard];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;

  const toPoints = (series: number[]): string =>
    series
      .map((value, index) => {
        const x = series.length > 1 ? (index / (series.length - 1)) * 100 : 0;
        const y = 100 - ((value - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(" ");

  return (
    <View style={[styles.container, { height }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Polyline
          points={toPoints(standard)}
          fill="none"
          stroke={color.textBody}
          strokeWidth={2.5}
          strokeDasharray="4,3"
          vectorEffect="non-scaling-stroke"
        />
        <Polyline
          points={toPoints(actual)}
          fill="none"
          stroke={color.accentSuccess}
          strokeWidth={3}
          vectorEffect="non-scaling-stroke"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
});
