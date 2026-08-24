import { Inbox, RefreshCw, TriangleAlert } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { color, font, radius, spacing } from "@/constants/theme";

type ListStateProps =
  | { state: "content"; children: ReactNode }
  | { state: "loading"; skeletonCount?: number }
  | { state: "empty"; message: string; actionLabel: string; onAction: () => void }
  | { state: "error"; reason: string; onRetry: () => void };

/**
 * الحالات الأربع الإلزامية لكل قائمة (docs/app-complete-spec.md §8.17 و§15-4):
 * عادية · تحميل (هيكل عظمي لا دوّامة) · فارغة (أيقونة + جملة + زر) · خطأ
 * (السبب + زر إعادة المحاولة). الحالة العادية وحدها غير مقبولة.
 */
export function ListState(props: ListStateProps) {
  switch (props.state) {
    case "content":
      return <>{props.children}</>;

    case "loading":
      return (
        <View style={styles.centerBlock}>
          {Array.from({ length: props.skeletonCount ?? 3 }).map((_, index) => (
            <View key={index} style={styles.skeletonRow} />
          ))}
        </View>
      );

    case "empty":
      return (
        <View style={styles.centerBlock}>
          <Inbox color={color.textBody} size={40} />
          <Text style={styles.message}>{props.message}</Text>
          <Pressable
            onPress={props.onAction}
            accessibilityRole="button"
            style={styles.actionButton}
          >
            <Text style={styles.actionLabel}>{props.actionLabel}</Text>
          </Pressable>
        </View>
      );

    case "error":
      return (
        <View style={styles.centerBlock}>
          <TriangleAlert color={color.statusCritical} size={40} />
          <Text style={styles.message}>{props.reason}</Text>
          {/* إعادة المحاولة إجراء آمن لا خطِر — ثانوي، لا أحمر ممتلئ (§7.1:
              الأحمر محصور بالخطر/النزاع/الرفض). */}
          <Button label="إعادة المحاولة" variant="secondary" icon={RefreshCw} onPress={props.onRetry} />
        </View>
      );
  }
}

const styles = StyleSheet.create({
  centerBlock: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  skeletonRow: {
    width: "100%",
    height: 56,
    borderRadius: radius.small,
    backgroundColor: color.surfaceSunken,
  },
  message: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "center",
  },
  actionButton: {
    height: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.control,
    backgroundColor: color.accentSuccess,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: font.size.content,
    fontFamily: font.familyBold,
    color: color.textOnDark,
    writingDirection: "rtl",
  },
});
