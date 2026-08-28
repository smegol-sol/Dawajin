import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { ListState } from "@/components/ui/ListState";
import { spacing } from "@/constants/theme";

interface LevelListProps<T> {
  items: T[] | undefined;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  /** نص الحالة الفارغة — «لا شيء هنا **لك**» لا «لا شيء هنا» (القرار #132). */
  emptyMessage: string;
  createLabel?: string;
  onCreate?: () => void;
  renderItem: (item: T) => ReactNode;
  keyOf: (item: T) => number;
  /**
   * ترتيب العناصر وحده — **والحالات الأربع تبقى هنا مشتركة كما هي**.
   * `list` قائمة رأسية ببطاقات كاملة العرض (الافتراضي، المواقع والمزارع)،
   * و`grid` شبكة ثلاثة أعمدة (العنابر — §5-د/2).
   */
  layout?: "list" | "grid";
}

/**
 * الحالات الأربع الإلزامية لكل مستوى (§8.17): تحميل · خطأ · فارغة · محتوى.
 * مشتركة بين المستويات الثلاثة كي لا يسقط أحدها حالةً سهوًا.
 *
 * **زر الإنشاء يظهر بالقدرة لا بالدور** — الشاشة تمرّر `onCreate` فقط حين
 * تسمح القدرة، وهو **نفسه فعل الحالة الفارغة** فلا يوجد مساران للفعل نفسه.
 * وغيابه يجعل الحالة الفارغة بلا زر: من لا يملك الإنشاء لا يُعرض له طريق
 * مسدود.
 */
export function LevelList<T>({
  items,
  isLoading,
  error,
  onRetry,
  emptyMessage,
  createLabel,
  onCreate,
  renderItem,
  keyOf,
  layout = "list",
}: LevelListProps<T>) {
  if (isLoading) return <ListState state="loading" />;
  if (error !== null) return <ListState state="error" reason={error} onRetry={onRetry} />;

  const rows = items ?? [];
  if (rows.length === 0) {
    return createLabel !== undefined && onCreate !== undefined ? (
      <ListState
        state="empty"
        message={emptyMessage}
        actionLabel={createLabel}
        onAction={onCreate}
      />
    ) : (
      <ListState state="empty" message={emptyMessage} actionLabel="تحديث" onAction={onRetry} />
    );
  }

  return (
    <View style={styles.list}>
      {createLabel !== undefined && onCreate !== undefined ? (
        <Button label={createLabel} variant="secondary" onPress={onCreate} />
      ) : null}
      <LevelRows rows={rows} layout={layout} renderItem={renderItem} keyOf={keyOf} />
    </View>
  );
}

/** ترتيب الصفوف وحده — مفصول كي يبقى `LevelList` حاملًا للحالات الأربع فقط. */
function LevelRows<T>({
  rows,
  layout,
  renderItem,
  keyOf,
}: {
  rows: T[];
  layout: "list" | "grid";
  renderItem: (item: T) => ReactNode;
  keyOf: (item: T) => number;
}) {
  if (layout === "list") {
    return (
      <>
        {rows.map((item) => (
          <View key={keyOf(item)}>{renderItem(item)}</View>
        ))}
      </>
    );
  }

  return (
    <View style={styles.grid}>
      {rows.map((item) => (
        <View key={keyOf(item)} style={styles.gridCell}>
          {renderItem(item)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  /**
   * ثلاثة أعمدة (قرار المالك، القرار رقم 178). `flexBasis: 30%` يمنع دخول
   * عنصر رابع في الصف (4×30% يتجاوز 100%)، و`flexGrow` يوزّع الباقي فتملأ
   * الثلاثة العرض. و`alignItems` الافتراضي `stretch` **يساوي ارتفاعات
   * مربّعات الصف** فلا يتفاوت المربّع الذي التفّ نصّه سطرين عن جاره.
   */
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  gridCell: { flexBasis: "30%", flexGrow: 1 },
});
