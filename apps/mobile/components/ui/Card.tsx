import { MoreVertical } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";

import type { BadgeTone } from "@/components/ui/Badge";
import { color, component, font, radius, spacing } from "@/constants/theme";

const EDGE_TONE_COLOR: Record<BadgeTone, string> = {
  success: color.accentSuccess,
  warning: color.statusWarning,
  critical: color.statusCritical,
  info: color.statusInfo,
};

interface CardBaseProps {
  title: string;
  subtitle?: string;
  /** شارة الحالة (docs/app-complete-spec.md §8.1) — يمينًا مع العنوان. */
  badge?: ReactNode;
  /** صف المؤشرات — عادة StatTile متعددة. */
  children?: ReactNode;
  /** ⋮ في صفّ العنوان — وضغطه **لا يُطلق تنقّل البطاقة** (القرار رقم 180). */
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

/**
 * **«بطاقة واحدة = إجراء أساسي واحد» — غير قابلة للتمثيل لا وصيةً في تعليق**
 * (القرار رقم 180). اتحاد مميَّز يرفضه المترجم إن مُرِّر الإجراءان معًا:
 *
 * - `onPress`: **البطاقة كلها هي الإجراء** — التنقّل بالضغط عليها.
 * - `primaryActionLabel` + `onPrimaryAction`: زرّ إجراء داخل التذييل.
 *
 * وكان الشرط تعليقًا يُقرأ ولا يُفرض، **فصار نوعًا يفشل عند الترجمة**.
 */
type CardActionProps =
  | { onPress?: undefined; primaryActionLabel?: undefined; onPrimaryAction?: undefined }
  | { onPress: () => void; primaryActionLabel?: undefined; onPrimaryAction?: undefined }
  | { onPress?: undefined; primaryActionLabel: string; onPrimaryAction: () => void };

type CardProps = CardBaseProps & CardActionProps;

/** Card — بطاقة كيان (docs/app-complete-spec.md §8.3). بطاقة واحدة = كيان واحد = إجراء أساسي واحد. */
export function Card({
  title,
  subtitle,
  badge,
  children,
  primaryActionLabel,
  onPrimaryAction,
  onPress,
  onMorePress,
  variant = "default",
  edgeTone,
  testID,
}: CardProps) {
  const isIdentity = variant === "identity";
  // ⋮ انتقل إلى صفّ العنوان، فالتذييل لم يعد يحمل إلا الإجراء الأساسي
  const hasFooter = primaryActionLabel !== undefined;
  const Container = onPress === undefined ? View : Pressable;

  return (
    <Container
      {...(onPress === undefined
        ? {}
        : { onPress, accessibilityRole: "button" as const, accessibilityLabel: title })}
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
      <CardHeader
        title={title}
        badge={badge}
        isIdentity={isIdentity}
        onMorePress={onMorePress}
        testID={testID}
      />
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
        <FooterBlock
          dark={isIdentity}
          primaryActionLabel={primaryActionLabel}
          onPrimaryAction={onPrimaryAction}
        />
      ) : null}
    </Container>
  );
}

/** صفّ العنوان: الاسم، ثم الشارة و⋮ — مفصول كي يبقى `Card` مقروءًا. */
function CardHeader({
  title,
  badge,
  isIdentity,
  onMorePress,
  testID,
}: {
  title: string;
  badge?: ReactNode;
  isIdentity: boolean;
  onMorePress?: (() => void) | undefined;
  testID?: string | undefined;
}) {
  return (
      <View style={styles.headerRow}>
      <Text style={[styles.title, isIdentity && styles.titleOnDark]}>{title}</Text>
      <View style={styles.headerEnd}>
        {badge}
        {onMorePress ? (
          <Pressable
            onPress={(event?: GestureResponderEvent) => {
              // **الضغط على ⋮ لا يُطلق تنقّل البطاقة** — الإيقاف صريح لا
              // اتّكالًا على أن RN يمنح الاستجابة للأعمق (القرار رقم 180).
              // والحدث قد يغيب (بيئة اختبار أو حدث مُصنَّع) فلا يُفترض وجوده.
              event?.stopPropagation();
              onMorePress();
            }}
            accessibilityRole="button"
            accessibilityLabel={`خيارات ${title}`}
            testID={testID === undefined ? undefined : `${testID}-more`}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MoreVertical color={isIdentity ? color.textOnDark : color.textBody} size={20} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** الفاصل والتذييل معًا — كتلة واحدة تُبقي `Card` دون حدّ الأسطر. */
function FooterBlock({
  dark,
  primaryActionLabel,
  onPrimaryAction,
}: {
  dark: boolean;
  primaryActionLabel?: string | undefined;
  onPrimaryAction?: (() => void) | undefined;
}) {
  return (
    <>
      <Divider dark={dark} />
      <CardFooter
        dark={dark}
        primaryActionLabel={primaryActionLabel}
        onPrimaryAction={onPrimaryAction}
      />
    </>
  );
}

function Divider({ dark }: { dark: boolean }) {
  return <View style={[styles.divider, dark && styles.dividerOnDark]} />;
}

function CardFooter({
  dark,
  primaryActionLabel,
  onPrimaryAction,
}: {
  dark: boolean;
  primaryActionLabel?: string | undefined;
  onPrimaryAction?: (() => void) | undefined;
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
  defaultContainer: {
    backgroundColor: color.surfaceCard,
    borderColor: color.borderSubtle,
  },
  identityContainer: {
    backgroundColor: color.brandPrimary,
    borderColor: color.brandPrimary,
  },
  headerRow: {
    flexDirection: "row",
    /**
     * **`center` لا `baseline`** (القرار رقم 180). النموذج يضع في هذا الصفّ
     * **نصّين** فيصحّ فيه `baseline`؛ ونحن نضع **نصًّا وأيقونة**، و`<View>`
     * لا يملك خطّ قاعدة نصّي — فتأخذ Yoga حافته السفلى قاعدةً له، **فيهبط
     * الصندوق كله** حتى تلامس حافته السفلى قاعدة العنوان.
     *
     * وأثره على الجهاز: ⋮ أسفل الاسم بنحو 26px ملتصقًا بالفاصل، **وسطر كامل
     * يشغله وحده** فتطول البطاقة بلا معلومة.
     *
     * **ولم يكشفه مخرَج الويب**: `react-native-web` يحسب خطّ القاعدة بقواعد
     * CSS لا بـYoga، فيُحاذي المركز صدفةً — ولهذا مرّ العطب من البوابات.
     */
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  headerEnd: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
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
