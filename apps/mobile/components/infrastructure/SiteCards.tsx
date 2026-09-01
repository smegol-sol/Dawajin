import { MoreVertical } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { StatusDistributionBar } from "@/components/ui/StatusDistributionBar";
import { color, font, radius, spacing, statusFill } from "@/constants/theme";
import { houseStatusIcon, houseStatusShortLabel, houseStatusTone } from "@/lib/houseStatusTone";
import type { FarmCard, HouseCard, SiteCard } from "@/lib/infrastructureApi";

/**
 * بطاقات المستويات الثلاثة.
 *
 * **العدّادات تُعرض كما جاءت من الخادم** (القرار #131): محسوبة تحت فلتر
 * الإسناد، فما يراه المستخدم هو ما يُعدّ. لا حساب هنا ولا جلب إضافي للعدّ.
 */

export function SiteRow({
  site,
  onOpen,
  onEdit,
}: {
  site: SiteCard;
  onOpen: () => void;
  onEdit?: (() => void) | undefined;
}) {
  return (
    <Card
      title={site.name}
      onPress={onOpen}
      testID={`site-card-${String(site.id)}`}
      {...(onEdit ? { onMorePress: onEdit } : {})}
    >
      <StatTile label="المزارع" value={site.farmCount} />
      <StatTile label="العنابر" value={site.houseCount} />
    </Card>
  );
}

export function FarmRow({
  farm,
  onOpen,
  onEdit,
}: {
  farm: FarmCard;
  onOpen: () => void;
  onEdit?: (() => void) | undefined;
}) {
  const { occupied, ready, other } = farm.houseStatusCounts;
  return (
    <Card
      title={farm.name}
      subtitle={farm.powerSources.join(" · ")}
      onPress={onOpen}
      testID={`farm-card-${String(farm.id)}`}
      {...(onEdit ? { onMorePress: onEdit } : {})}
    >
      <StatusDistributionBar
        counts={{ occupied, ready, other }}
        emptyLabel="لا عنابر في هذه المزرعة بعد"
        testID={`farm-status-${String(farm.id)}`}
      />
    </Card>
  );
}

/**
 * مربّع العنبر في شبكة المستوى الثالث (§5-د/2: «شبكة عنابر ملوّنة بالحالة»).
 *
 * **ممتلئ بلون الحالة لا بطاقة بحافة** (القرار رقم 178): نمط حافة الحالة في
 * §8.3 مقصور على **القوائم** ومعلَّل بقائمة من 20 بطاقة — والشبكة ليست قائمة.
 *
 * **ويحمل الثلاثة معًا** (§8.1 و§11: عمى الألوان شائع ولن يخبرك أحد): لون
 * التعبئة · الأيقونة · **والتسمية القصيرة نصًّا داخل المربّع**. ودليل ألوان
 * فوق الشبكة **لا يُغني عن النص**: قراءته نفسها تتطلّب تمييز الألوان.
 *
 * **والنصّ أبيض على تعبئة قِيست** — كل لون تعبئة ≥4.5 مع الأبيض، ويحرسه فاحص
 * آلي فلا يعود لون ساقط بعد اليوم.
 *
 * **ولا اقتطاع**: لا `numberOfLines` على شيء — التسمية القصيرة تكفي عمودًا
 * بعرض 114px بلا قصّ ولا تصغير خط.
 */
export function HouseTile({
  house,
  onEdit,
}: {
  house: HouseCard;
  onEdit?: (() => void) | undefined;
}) {
  const tone = houseStatusTone(house.status);
  const Icon = houseStatusIcon(house.status);
  return (
    <View
      testID={`house-tile-${String(house.id)}`}
      style={[styles.tile, { backgroundColor: statusFill[tone] }]}
    >
      {/* الثلاث نقاط في صفّ الاسم — سطر مستقل كان يطيل المربّع بلا فائدة */}
      <View style={styles.tileNameRow}>
        <Text style={styles.tileName}>{house.name}</Text>
        {onEdit ? (
          <Pressable
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel={`تعديل ${house.name}`}
            testID={`house-tile-edit-${String(house.id)}`}
            style={styles.tileEdit}
            // الصندوق المرئي أصغر من هدف اللمس، فيُوسَّع بلا إطالة المربّع
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <MoreVertical color={color.textOnDark} size={20} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.tileType}>{house.type ?? "النوع غير محدَّد"}</Text>
      <View style={styles.tileStatus}>
        <Icon color={color.textOnDark} size={14} strokeWidth={2.5} />
        <Text style={styles.tileStatusLabel}>{houseStatusShortLabel(house.status)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.xxs,
    // يملأ ارتفاع صفّه فتتساوى المربّعات
    flex: 1,
  },
  tileNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xxs,
  },
  tileName: {
    flexShrink: 1,
    fontSize: font.size.content,
    fontFamily: font.familyBold,
    color: color.textOnDark,
    writingDirection: "rtl",
    textAlign: "right",
  },
  tileType: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textOnDark,
    writingDirection: "rtl",
    textAlign: "right",
  },
  tileStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  tileStatusLabel: {
    fontSize: font.size.content,
    fontFamily: font.familyBold,
    color: color.textOnDark,
    writingDirection: "rtl",
  },
  tileEdit: {
    // أدنى مساحة لمس 44 (المواصفة §16) — يبلغها بـhitSlop لا بارتفاع صريح،
    // فالصفّ لا يطول والهدف يبقى مستوفًى
    alignItems: "center",
    justifyContent: "center",
  },
});
