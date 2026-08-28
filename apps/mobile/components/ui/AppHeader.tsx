import { StatusBar } from "expo-status-bar";
import { ArrowRight, Bell, CircleUser } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { color, font, radius, spacing, touchTarget, withAlpha } from "@/constants/theme";

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
/**
 * العنصر الأول في الرأس: سهم الرجوع في المتغيّر الفرعي، وأيقونة الحساب في
 * الرئيسي (§8.8). استُخرج لأن `AppHeader` بلغ حدّ `max-lines-per-function`،
 * والقسمة بالمعنى لا اعتباطًا (نمط القرار #65).
 */
function LeadingAction({
  variant,
  onBackPress,
  onAccountPress,
}: {
  variant: "main" | "sub";
  onBackPress?: (() => void) | undefined;
  onAccountPress?: (() => void) | undefined;
}) {
  if (variant === "sub") {
    return (
      <Pressable
        onPress={onBackPress}
        accessibilityRole="button"
        accessibilityLabel="رجوع"
        hitSlop={8}
        testID="app-header-back"
      >
        <ArrowRight color={color.textOnDark} size={24} />
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={onAccountPress}
      accessibilityRole="button"
      accessibilityLabel="الحساب"
      hitSlop={8}
      testID="app-header-account"
    >
      <CircleUser color={color.textOnDark} size={28} />
    </Pressable>
  );
}

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
      {/* أيقونات النظام فوق الترويسة الخضراء: داكنة عليها 1.28:1 وبيضاء
          12.72:1 (القرار #175). والضبط هنا لا على الجذر لأن شاشات المصادقة
          بلا ترويسة وخلفيتها فاتحة — فتحتاج العكس. */}
      <StatusBar style="light" />
      <LeadingAction variant={variant} onBackPress={onBackPress} onAccountPress={onAccountPress} />

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
        <Bell color={color.textOnDark} size={24} />
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
    backgroundColor: color.brandPrimary,
  },
  titleBlock: {
    flex: 1,
    gap: spacing.xxs,
  },
  title: {
    fontSize: font.size.screenTitle,
    fontFamily: font.familyBold,
    color: color.textOnDark,
    writingDirection: "rtl",
    textAlign: "right",
  },
  contextLine: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: withAlpha(color.textOnDark, 0.72),
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
