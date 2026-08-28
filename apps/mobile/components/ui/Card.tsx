import { MoreVertical } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { BadgeTone } from "@/components/ui/Badge";
import { color, component, font, radius, spacing } from "@/constants/theme";

const EDGE_TONE_COLOR: Record<BadgeTone, string> = {
  success: color.accentSuccess,
  warning: color.statusWarning,
  critical: color.statusCritical,
  info: color.statusInfo,
};

interface CardProps {
  title: string;
  subtitle?: string;
  /** شارة الحالة (docs/app-complete-spec.md §8.1) — يمينًا مع العنوان. */
  badge?: ReactNode;
  /** صف المؤشرات — عادة StatTile متعددة. */
  children?: ReactNode;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  onMorePress?: () => void;
  /** بطاقة الهوية الداكنة لرأس شاشة تفاصيل الدفعة (§8.3). */
  variant?: "default" | "identity";
  /**
   * حد أيمن 4px بلون الحالة بدل تلوين الخلفية كاملة — أوضح في قائمة طويلة
   * من البطاقات (§8.3: "نمط حافة الحالة").
   */
  edgeTone?: BadgeTone;
  /**
   * معرّف الاختبار على حاوية البطاقة — نقطة الإمساك الوحيدة لتأكيدات
   * التخطيط (`boundingBox`) في `layout-tests/`. لا أثر بصري له إطلاقًا.
   */
  testID?: string;
}

/** Card — بطاقة كيان (docs/app-complete-spec.md §8.3). بطاقة واحدة = كيان واحد = إجراء أساسي واحد. */
export function Card({
  title,
  subtitle,
  badge,
  children,
  primaryActionLabel,
  onPrimaryAction,
  onMorePress,
  variant = "default",
  edgeTone,
  testID,
}: CardProps) {
  const isIdentity = variant === "identity";
  const hasFooter = primaryActionLabel !== undefined || onMorePress !== undefined;

  return (
    <View
      testID={testID}
      style={[
        styles.container,
        isIdentity ? styles.identityContainer : styles.defaultContainer,
        // physical-right عمدًا لا logical (borderStartWidth/borderEndWidth):
        // RN لا يعكس خاصية فيزيائية تحت I18nManager.isRTL، فيبقى الحد على
        // يمين الشاشة بصريًا دائمًا (component.statusEdge.side في tokens.json).
        edgeTone
          ? {
              borderRightWidth: component.statusEdge.width,
              borderRightColor: EDGE_TONE_COLOR[edgeTone],
            }
          : null,
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, isIdentity && styles.titleOnDark]}>{title}</Text>
        {badge}
      </View>
      {subtitle ? (
        <Text style={[styles.subtitle, isIdentity && styles.subtitleOnDark]}>{subtitle}</Text>
      ) : null}

      {children ? (
        <>
          <Divider dark={isIdentity} />
          <View style={styles.statsRow}>{children}</View>
        </>
      ) : null}

      {hasFooter ? (
        <>
          <Divider dark={isIdentity} />
          <CardFooter
            dark={isIdentity}
            primaryActionLabel={primaryActionLabel}
            onPrimaryAction={onPrimaryAction}
            onMorePress={onMorePress}
          />
        </>
      ) : null}
    </View>
  );
}

function Divider({ dark }: { dark: boolean }) {
  return <View style={[styles.divider, dark && styles.dividerOnDark]} />;
}

function CardFooter({
  dark,
  primaryActionLabel,
  onPrimaryAction,
  onMorePress,
}: {
  dark: boolean;
  primaryActionLabel?: string | undefined;
  onPrimaryAction?: (() => void) | undefined;
  onMorePress?: (() => void) | undefined;
}) {
  return (
    <View style={styles.footerRow}>
      {primaryActionLabel ? (
        <Pressable
          onPress={onPrimaryAction}
          accessibilityRole="button"
          style={styles.primaryActionPress}
        >
          <Text numberOfLines={1} style={[styles.primaryAction, dark && styles.titleOnDark]}>
            {primaryActionLabel}
          </Text>
        </Pressable>
      ) : (
        <View />
      )}
      {onMorePress ? (
        <Pressable onPress={onMorePress} accessibilityRole="button" hitSlop={8}>
          <MoreVertical color={dark ? color.textOnDark : color.textBody} size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.card,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.xxs,
  },
  /**
   * البطاقة الكيانية «كبرى» فتأخذ `surface.raised` — §7.1 تعرّف الأدوار
   * و§8.3 كانت تصف حالة، وحُسم التعارض للتعريف (القرار #175). والأبيض يبقى
   * للكتلة الداخلية كما يعرّفه الجدول.
   */
  defaultContainer: {
    backgroundColor: color.surfaceRaised,
    borderColor: color.borderCard,
  },
  identityContainer: {
    backgroundColor: color.brandPrimary,
    borderColor: color.brandPrimary,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: font.size.subtitle,
    fontFamily: font.familyBold,
    color: color.brandPrimary,
    writingDirection: "rtl",
  },
  titleOnDark: {
    color: color.textOnDark,
  },
  subtitle: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
  },
  subtitleOnDark: {
    color: color.textOnDark,
  },
  divider: {
    height: 1,
    backgroundColor: color.borderSubtle,
    marginVertical: spacing.sm,
  },
  dividerOnDark: {
    backgroundColor: color.textOnDark,
    opacity: 0.25,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  /**
   * الصندوق يأخذ العرض المتاح لا العرض المقاس للنصّ (القرار #173). بلا هذا
   * يساوي الصندوقُ ما قاسه المُقاس بالضبط، فخطأ قياس ببكسل واحد يكسر السطر
   * عند المسافة — وارتفاعُ سطرٍ واحد يجعل الكسر **قصًّا صامتًا** لا التفافًا
   * ظاهرًا. والفائض هنا يبتلع خطأ القياس (963 متاحة مقابل ~250 مطلوبة).
   */
  primaryActionPress: {
    flex: 1,
  },
  primaryAction: {
    fontSize: font.size.content,
    fontFamily: font.familyBold,
    color: color.accentSuccess,
    writingDirection: "rtl",
  },
});
