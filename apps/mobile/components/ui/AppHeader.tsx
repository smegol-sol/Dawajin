import { ArrowRight, Bell, CircleUser } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { color, font, radius, spacing, touchTarget } from "@/constants/theme";

interface AppHeaderProps {
  title: string;
  /** سطر السياق تحت العنوان — المتغيّر الفرعي فقط (§8.8). */
  contextLine?: string;
  onBellPress?: () => void;
  hasNotifications?: boolean;
  variant: "main" | "sub";
  /** المتغيّر الفرعي فقط — سهم الرجوع يشير يمينًا (§10 قاعدة 1). */
  onBackPress?: () => void;
  onAccountPress?: () => void;
}

/**
 * AppHeader — متغيّران (docs/app-complete-spec.md §8.8). عنوان الشاشة
 * محاذاته يمين حصرًا (§10 قاعدة 4)، وترتيب الأبناء [يمين → وسط → يسار]
 * يعتمد على انعكاس flexDirection: row التلقائي تحت I18nManager.forceRTL.
 */
export function AppHeader({
  title,
  contextLine,
  onBellPress,
  hasNotifications = false,
  variant,
  onBackPress,
  onAccountPress,
}: AppHeaderProps) {
  // شريط الحالة يُرسم فوق الترويسة تحت edge-to-edge المفروض من أندرويد 15+
  // (القرار #171) — الحشو يُضاف إلى `paddingVertical` لا يستبدله، فالمسافة
  // الداخلية تبقى كما هي والإزاحة وحدها هي الجديدة. على الويب القيمة صفر.
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.container, { paddingTop: spacing.md + insets.top }]}
      testID="app-header"
    >
      {variant === "sub" ? (
        <Pressable
          onPress={onBackPress}
          accessibilityRole="button"
          accessibilityLabel="رجوع"
          hitSlop={8}
          testID="app-header-back"
        >
          <ArrowRight color={color.brandPrimary} size={24} />
        </Pressable>
      ) : (
        <Pressable
          onPress={onAccountPress}
          accessibilityRole="button"
          accessibilityLabel="الحساب"
          hitSlop={8}
          testID="app-header-account"
        >
          <CircleUser color={color.brandPrimary} size={28} />
        </Pressable>
      )}

      <View style={styles.titleBlock}>
        <Text style={styles.title} numberOfLines={1} testID="app-header-title">
          {title}
        </Text>
        {variant === "sub" && contextLine ? (
          <Text style={styles.contextLine} numberOfLines={1}>
            {contextLine}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={onBellPress}
        accessibilityRole="button"
        accessibilityLabel="الإشعارات"
        hitSlop={8}
        style={styles.bell}
        testID="app-header-bell"
      >
        <Bell color={color.brandPrimary} size={24} />
        {hasNotifications ? <View style={styles.bellDot} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: touchTarget.minimum,
    backgroundColor: color.surfaceRaised,
  },
  titleBlock: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    fontSize: font.size.screenTitle,
    fontFamily: font.familyBold,
    color: color.brandPrimary,
    writingDirection: "rtl",
    textAlign: "right",
  },
  contextLine: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "right",
  },
  bell: {
    position: "relative",
  },
  bellDot: {
    position: "absolute",
    top: -2,
    left: -2,
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.statusCritical,
  },
});
