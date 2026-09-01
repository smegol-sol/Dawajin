import { HOUSE_CREATABLE_STATUSES, type HouseCreatableStatus } from "@dawajin/shared";
import { StyleSheet, Text, View } from "react-native";

import { Chip } from "@/components/ui/Chip";
import { FormField } from "@/components/ui/FormField";
import { color, font, spacing } from "@/constants/theme";

/**
 * الحالة الابتدائية للعنبر عند إنشائه — §7-ب البند 40، والقرار 226.
 *
 * **ولا خيار مُسبَق الاختيار** (القرار 186): `selected` تبدأ `null`، **والفرق
 * بين «اختار جاهزًا» و«لم يختر فوُضع جاهزًا» هو كل ما في 186** — **وحقلٌ
 * بقيمة افتراضية يُعيد ادّعاء الجاهزية بلبوس آخر**.
 *
 * **والقائمة تُقرأ من `HOUSE_CREATABLE_STATUSES` ولا تُكتب هنا نصًّا** (القرار
 * 222): مصدرٌ واحد للخادم والشاشة، **وحالةٌ تُضاف غدًا تظهر بلا تعديل**.
 *
 * **و`Chip` لا `SegmentedControl`** — مقيسٌ على المكوّنين القائمين: الثاني
 * **فلترُ قوائم يلزمه عدّاد لكل خيار ويُخفي ما عدّاده صفر** (§8.13)، **ولا
 * يحتمل «لا شيء مختار»** (`selectedKey` نصٌّ لازم). **والأول يحمل `selected`
 * لكل خيار على حدة، فحالةُ «لم يُختر بعد» تُمثَّل بلا تحايل** — وهي الحالة
 * التي يقوم عليها الحكم.
 */

/** **السبب إلزاميّ عند الميلاد خارج الخدمة** — القرار 222، وحكم 220 ممتدًّا. */
export const STATUS_NEEDING_REASON: readonly HouseCreatableStatus[] = ["تحت الصيانة", "معطّل"];

export function statusNeedsReason(status: HouseCreatableStatus | null): boolean {
  return status !== null && STATUS_NEEDING_REASON.includes(status);
}

/**
 * سببُ تعطيل الحفظ، أو `null` إن اكتمل ما يخصّ الحالة.
 *
 * **يُقرأ قبل الضغط لا بعده** (§8.2: «السبب يظهر **قبل** الضغط»)، **فلا زر
 * يفشل عند الضغط** (§11) — **والخادم يبقى الحارس الأخير** بـ422.
 */
export function houseStatusBlockReason(
  status: HouseCreatableStatus | null,
  reason: string
): string | null {
  if (status === null) return "اختر حالة العنبر الابتدائية";
  if (statusNeedsReason(status) && reason.trim() === "") {
    return `السبب مطلوب عند إنشاء عنبر في «${status}»`;
  }
  return null;
}

export function HouseStatusPicker({
  selected,
  onSelect,
  reason,
  onChangeReason,
}: {
  selected: HouseCreatableStatus | null;
  onSelect: (status: HouseCreatableStatus) => void;
  reason: string;
  onChangeReason: (value: string) => void;
}) {
  return (
    <View style={styles.block}>
      <Text style={styles.label} testID="house-status-label">
        الحالة الابتدائية — تُختار ولا تُفترض
      </Text>
      <View style={styles.chips}>
        {HOUSE_CREATABLE_STATUSES.map((status) => (
          <Chip
            key={status}
            label={status}
            selected={selected === status}
            onPress={() => {
              onSelect(status);
            }}
          />
        ))}
      </View>
      {statusNeedsReason(selected) ? (
        <FormField
          label="سبب خروج العنبر من الخدمة"
          type="text"
          value={reason}
          onChangeText={onChangeReason}
          testID="house-status-reason"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  // نفس رموز تسمية `FormField` — التسمية واحدة في الورقة وإن لم تكن حقلًا
  label: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.brandPrimary,
    writingDirection: "rtl",
    textAlign: "right",
  },
  // **يلتفّ ولا يُقصّ** — ثلاث تسميات عربية على 361dp لا تسع صفًّا واحدًا
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
