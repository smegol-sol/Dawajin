import { FEED_STAGE, type FeedStage } from "@dawajin/shared";
import { Plus } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { color, font, spacing } from "@/constants/theme";
import type { ProductCard } from "@/lib/dailyLogApi";
import {
  feedComputedLine,
  feedProductsOf,
  sectionCount,
  stageOfProduct,
  type FeedRowDraft,
  type RowErrors,
} from "@/lib/dailyLogForm";

/**
 * **العلف — الصنفُ ثم الأكياس بخطوة ٠٫٥، وتحتها الكجم المحسوب** (§2).
 *
 * **والمرحلةُ تُعرض ولا تُسأل** (القرار 292): كانت سؤالًا أوّلَ يُتبَع بسؤال
 * الصنف — **وجوابُهما واحدٌ في الغالب**، فيومَ الخلط أربعُ لمساتٍ لصفّين.
 * **واليوم لمسةٌ لكل صفّ، والمرحلةُ تتبع ما اختير.**
 *
 * **والمرونةُ باقية:** خلطُ مرحلتين في يومٍ واحد **صفّان بصنفين**، وكلٌّ
 * يحمل مرحلته — **وهو ما بُني له «إضافة نوع علف» أصلًا** (حكم المالك).
 *
 * **والكجم يُعرض ولا يُرسَل** (§15، والقرار 201): الخادم يحسبه من وزن الكيس
 * المجمَّد على الصنف — **وقبولُه من العميل يجعل الحساب دعوى**.
 *
 * **ولا صفَّ علفٍ افتراضيّ:** يومٌ بلا علفٍ واقعةٌ تُسجَّل، **وصفٌّ يُولد
 * بصفرٍ يُجبر المربّي على حذفه أو يُردّ طلبُه**.
 */
export function FeedBlock({
  rows,
  products,
  errorsOf,
  onChange,
  onAdd,
  onRemove,
}: {
  rows: readonly FeedRowDraft[];
  products: readonly ProductCard[];
  /** **يُسأل لكل صفّ** — والشاشةُ تملك قائمة الأخطاء فلا تُعاد قسمتها هنا. */
  errorsOf: (rowKey: string) => RowErrors;
  onChange: (key: string, patch: Partial<FeedRowDraft>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <View style={styles.block}>
      {/* **العدّاد يظهر حين يُفيد وحده** — والحكمُ في `sectionCount` فيُفحص وحده */}
      <SectionHeader
        title="العلف"
        {...(() => {
          const count = sectionCount(rows);
          return count === undefined ? {} : { count };
        })()}
      />
      {rows.map((row) => (
        <FeedRow
          key={row.key}
          row={row}
          products={products}
          errors={errorsOf(row.key)}
          onChange={onChange}
          onRemove={onRemove}
        />
      ))}
      <Button label="إضافة نوع علف آخر" variant="secondary" icon={Plus} onPress={onAdd} />
    </View>
  );
}

/** صفٌّ واحد — **مفصولٌ لأن الحدّ يُحترم بالفصل لا برفعه** (`max-lines-per-function`). */
function FeedRow({
  row,
  products,
  errors,
  onChange,
  onRemove,
}: {
  row: FeedRowDraft;
  products: readonly ProductCard[];
  errors: RowErrors;
  onChange: (key: string, patch: Partial<FeedRowDraft>) => void;
  onRemove: (key: string) => void;
}) {
  const candidates = feedProductsOf(products);
  const selected = candidates.find((product) => product.id === row.productId);
  const line = feedComputedLine(selected, row.bags);

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>العلف</Text>
      <ProductPicker row={row} candidates={candidates} onChange={onChange} />
      <FieldNote message={errors.product} />

      {/* **المرحلةُ تُعرض لا تُسأل** — و«تسمية: قيمة» صيغةٌ ثابتة (القرار 287) */}
      {row.stage === null ? null : <Text style={styles.derived}>{`المرحلة: ${row.stage}`}</Text>}
      {/* **وتُسأل وحدها حين يكون الصنفُ بلا مرحلة** — ولا صنفَ كذلك اليوم */}
      {row.productId !== null && row.stage === null ? (
        <>
          <Text style={styles.rowLabel}>المرحلة</Text>
          <StagePicker row={row} onChange={onChange} />
          <FieldNote message={errors.stage} />
        </>
      ) : null}

      <NumberStepper
        label="الأكياس"
        value={row.bags}
        step={0.5}
        onChange={(bags) => {
          onChange(row.key, { bags });
        }}
        {...(line === undefined ? {} : { computedLine: line })}
      />
      <FieldNote message={errors.bags} />
      <Button
        label="حذف هذا الصفّ"
        variant="secondary"
        onPress={() => {
          onRemove(row.key);
        }}
      />
    </View>
  );
}

/**
 * **علامةُ الحقل الناقص — لونٌ ونصٌّ معًا لا لونٌ وحده** (§488: «ممنوع
 * الاعتماد على اللون وحده — عمى الألوان شائع»).
 *
 * **وموضعُها تحت حقلها مباشرة** (§8.11) — **لا في ذيل الشاشة تحت الزرّ**،
 * وهو ما جعل المالك يقرأ الزرَّ معطَّلًا لا منتظِرًا (القرار 292).
 */
function FieldNote({ message }: { message?: string | undefined }) {
  if (message === undefined) return null;
  return <Text style={styles.fieldError}>{message}</Text>;
}

/**
 * **المرحلة — تُسأل وحدها حين يكون الصنفُ بلا مرحلة** (القرار 292).
 *
 * **ولا تُسقط الصنف بعد اليوم**: كانت تُسقطه لأن صنفَ مرحلةٍ أخرى لا يبقى
 * مختارًا صامتًا — **واليوم المرحلةُ تتبع الصنف لا تحكمه**، فلا شيءَ يسقط.
 */
function StagePicker({
  row,
  onChange,
}: {
  row: FeedRowDraft;
  onChange: (key: string, patch: Partial<FeedRowDraft>) => void;
}) {
  return (
    <View style={styles.chips}>
      {FEED_STAGE.map((stage: FeedStage) => (
        <Chip
          key={stage}
          label={stage}
          selected={row.stage === stage}
          onPress={() => {
            onChange(row.key, { stage });
          }}
        />
      ))}
    </View>
  );
}

/**
 * **الصنف — واختيارُه يضبط مرحلتَه معه** (القرار 292): سؤالٌ واحد لا اثنان.
 *
 * **ومخزنٌ بلا صنفِ علفٍ يُقال صراحةً لا يُترك فارغًا.**
 */
function ProductPicker({
  row,
  candidates,
  onChange,
}: {
  row: FeedRowDraft;
  candidates: readonly ProductCard[];
  onChange: (key: string, patch: Partial<FeedRowDraft>) => void;
}) {
  if (candidates.length === 0) {
    return <Text style={styles.note}>لا صنف علفٍ في مخزن العنبر</Text>;
  }
  return (
    <View style={styles.chips}>
      {candidates.map((product) => (
        <Chip
          key={product.id}
          label={product.name}
          selected={row.productId === product.id}
          onPress={() => {
            // **الصنفُ ومرحلتُه معًا** — والمرحلةُ تُشتقّ في `stageOfProduct`
            // فتُقرأ في موضعٍ واحد ويُفحص وحده
            onChange(row.key, { productId: product.id, stage: stageOfProduct(product) });
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: spacing.md },
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: color.borderSubtle,
  },
  rowLabel: {
    fontSize: font.size.content,
    fontFamily: font.familyBold,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "right",
  },
  note: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "right",
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  /** **المرحلة المشتقّة — تُقرأ ولا تُلمَس**، فبوزن النصّ العاديّ لا العنوان. */
  derived: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.textBody,
    writingDirection: "rtl",
    textAlign: "right",
  },
  /** **لونٌ ونصٌّ معًا** (§488) — والنصُّ هو الحامل، واللونُ تأكيدٌ له. */
  fieldError: {
    fontSize: font.size.content,
    fontFamily: font.familyBold,
    color: color.statusCritical,
    writingDirection: "rtl",
    textAlign: "right",
  },
});
