import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { LevelList } from "@/components/infrastructure/LevelList";
import { NameSheet } from "@/components/infrastructure/NameSheet";
import { FarmRow } from "@/components/infrastructure/SiteCards";
import { Chip } from "@/components/ui/Chip";
import { spacing } from "@/constants/theme";
import type { InfrastructureCapabilities } from "@/lib/capabilities";
import { createFarm, fetchFarms, updateFarm, type FarmCard } from "@/lib/infrastructureApi";
import { infrastructureErrorMessage } from "@/lib/infrastructureErrors";
import { useEntitySheet } from "@/lib/useEntitySheet";

/** لا مزرعة بلا مصدر طاقة (القرار #112) — القيمتان، والاختيار متعدد. */
const POWER_SOURCES = ["شمسية", "مولدات"];

/** المستوى الثاني — مزارع الموقع المرئية. **يُتخطّى عند مزرعة واحدة مرئية.** */
export function FarmsLevel({
  token,
  siteId,
  capabilities,
  onOpen,
}: {
  token: string;
  siteId: number;
  capabilities: InfrastructureCapabilities;
  onOpen: (farm: FarmCard, automatic: boolean) => void;
}) {
  const query = useQuery({ queryKey: ["farms", siteId], queryFn: () => fetchFarms(token, siteId) });
  const { form, power, setPower, startCreate, startEdit } = useFarmForm(token, siteId);

  const only = query.data?.length === 1 ? query.data[0] : undefined;
  useEffect(() => {
    if (only !== undefined) onOpen(only, true);
  }, [only, onOpen]);

  return (
    <>
      <LevelList
        items={query.data}
        isLoading={query.isPending}
        error={query.isError ? infrastructureErrorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        emptyMessage="لا مزارع مُسندة إليك في هذا الموقع"
        {...(capabilities.canCreate ? { createLabel: "إضافة مزرعة", onCreate: startCreate } : {})}
        keyOf={(farm) => farm.id}
        renderItem={(farm) => (
          <FarmRow
            farm={farm}
            onOpen={() => {
              onOpen(farm, false);
            }}
            onEdit={
              capabilities.canEdit
                ? () => {
                    startEdit(farm);
                  }
                : undefined
            }
          />
        )}
      />
      <NameSheet
        form={form}
        createTitle="مزرعة جديدة"
        editTitle="تعديل المزرعة"
        label="اسم المزرعة"
        initialValue={form.editing?.name ?? ""}
        extraError={power.length === 0 ? "اختر مصدر طاقة واحدًا على الأقل" : null}
      >
        <PowerPicker selected={power} onToggle={setPower} />
      </NameSheet>
    </>
  );
}

/**
 * ورقة المزرعة — الاسم ومصادر الطاقة معًا.
 *
 * مفصولة عن المكوّن لأنها تحمل حالتين تُهيَّآن معًا: مصادر الطاقة تُضبط
 * **مع فتح الورقة لا داخلها** — الإنشاء يبدأ فارغًا، والتعديل يبدأ بما هو
 * محفوظ فعلًا لا بفراغ يمحوه حفظٌ غير مقصود.
 */
function useFarmForm(token: string, siteId: number) {
  const client = useQueryClient();
  const [power, setPower] = useState<string[]>([]);

  const form = useEntitySheet<FarmCard>({
    save: (name, editing) =>
      editing === null
        ? createFarm(token, siteId, { name, powerSources: power })
        : updateFarm(token, editing.id, { name, powerSources: power }),
    afterSave: async () => {
      await client.invalidateQueries({ queryKey: ["farms", siteId] });
      // بطاقة الموقع تحمل عدّاد المزارع — إبطالها معها وإلا بقي العدّاد قديمًا
      await client.invalidateQueries({ queryKey: ["sites"] });
    },
  });

  return {
    form,
    power,
    setPower,
    startCreate: (): void => {
      setPower([]);
      form.openCreate();
    },
    startEdit: (farm: FarmCard): void => {
      setPower(farm.powerSources);
      form.openEdit(farm);
    },
  };
}

/** اختيار مصادر الطاقة — متعدد، ولا مزرعة بلا واحد. */
function PowerPicker({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (next: string[]) => void;
}) {
  return (
    <View style={styles.chips}>
      {POWER_SOURCES.map((source) => (
        <Chip
          key={source}
          label={source}
          selected={selected.includes(source)}
          onPress={() => {
            onToggle(
              selected.includes(source)
                ? selected.filter((item) => item !== source)
                : [...selected, source]
            );
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: spacing.sm },
});
