import { FEED_STAGE, type FeedStage } from "@dawajin/shared";
import { Plus } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { color, font, spacing } from "@/constants/theme";
import type { ProductCard } from "@/lib/dailyLogApi";
import { feedComputedLine, feedProductsOf, type FeedRowDraft } from "@/lib/dailyLogForm";

/**
 * **العلف — المرحلةُ ثم الصنفُ ثم الأكياس بخطوة ٠٫٥، وتحتها الكجم المحسوب**
 * (§2).
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
  onChange,
  onAdd,
  onRemove,
}: {
  rows: readonly FeedRowDraft[];
  products: readonly ProductCard[];
  onChange: (key: string, patch: Partial<FeedRowDraft>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <View style={styles.block}>
      <SectionHeader title="العلف" count={rows.length} />
      {rows.map((row) => (
        <FeedRow
          key={row.key}
          row={row}
          products={products}
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
  onChange,
  onRemove,
}: {
  row: FeedRowDraft;
  products: readonly ProductCard[];
  onChange: (key: string, patch: Partial<FeedRowDraft>) => void;
  onRemove: (key: string) => void;
}) {
  const candidates = feedProductsOf(products, row.stage);
  const selected = candidates.find((product) => product.id === row.productId);
  const line = feedComputedLine(selected, row.bags);

  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>المرحلة</Text>
      <StagePicker row={row} onChange={onChange} />

      <Text style={styles.rowLabel}>الصنف</Text>
      <ProductPicker row={row} candidates={candidates} onChange={onChange} />

      <NumberStepper
        label="الأكياس"
        value={row.bags}
        step={0.5}
        onChange={(bags) => {
          onChange(row.key, { bags });
        }}
        {...(line === undefined ? {} : { computedLine: line })}
      />
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
 * **المرحلة — وتغييرُها يُسقط الصنف**: صنفُ مرحلةٍ أخرى لا يبقى مختارًا
 * صامتًا فيُرسَل بمرحلةٍ لا تطابقه.
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
            onChange(row.key, { stage, productId: null });
          }}
        />
      ))}
    </View>
  );
}

/** **الصنف — ومخزنٌ بلا صنفٍ لهذه المرحلة يُقال صراحةً لا يُترك فارغًا.** */
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
    return <Text style={styles.note}>لا صنف علفٍ لهذه المرحلة في مخزن العنبر</Text>;
  }
  return (
    <View style={styles.chips}>
      {candidates.map((product) => (
        <Chip
          key={product.id}
          label={product.name}
          selected={row.productId === product.id}
          onPress={() => {
            onChange(row.key, { productId: product.id });
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
});
