import { useQuery, useQueryClient } from "@tanstack/react-query";

import { LevelList } from "@/components/infrastructure/LevelList";
import { NameSheet } from "@/components/infrastructure/NameSheet";
import { HouseRow } from "@/components/infrastructure/SiteCards";
import type { InfrastructureCapabilities } from "@/lib/capabilities";
import { createHouse, fetchHouses, renameHouse, type HouseCard } from "@/lib/infrastructureApi";
import { infrastructureErrorMessage } from "@/lib/infrastructureErrors";
import { useEntitySheet } from "@/lib/useEntitySheet";

/**
 * المستوى الثالث — عنابر المزرعة المرئية. **لا تخطّي بعده**: العنبر هو
 * الوحدة الأساسية، وما تحته (الدفعات والسجلات) خارج هذه الشاشة.
 */
export function HousesLevel({
  token,
  farmId,
  capabilities,
}: {
  token: string;
  farmId: number;
  capabilities: InfrastructureCapabilities;
}) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["houses", farmId],
    queryFn: () => fetchHouses(token, farmId),
  });

  const form = useEntitySheet<HouseCard>({
    save: (name, editing) =>
      editing === null ? createHouse(token, farmId, name) : renameHouse(token, editing.id, name),
    afterSave: () => client.invalidateQueries({ queryKey: ["houses", farmId] }),
  });

  return (
    <>
      <LevelList
        items={query.data}
        isLoading={query.isPending}
        error={query.isError ? infrastructureErrorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        emptyMessage="لا عنابر مُسندة إليك في هذه المزرعة"
        {...(capabilities.canCreate
          ? { createLabel: "إضافة عنبر", onCreate: form.openCreate }
          : {})}
        keyOf={(house) => house.id}
        renderItem={(house) => (
          <HouseRow
            house={house}
            onEdit={
              capabilities.canEdit
                ? () => {
                    form.openEdit(house);
                  }
                : undefined
            }
          />
        )}
      />
      <NameSheet
        form={form}
        createTitle="عنبر جديد"
        editTitle="تعديل العنبر"
        label="اسم العنبر"
        initialValue={form.editing?.name ?? ""}
      />
    </>
  );
}
