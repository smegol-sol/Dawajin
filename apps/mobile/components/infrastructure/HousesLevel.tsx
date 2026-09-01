import type { HouseCreatableStatus } from "@dawajin/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  HouseStatusPicker,
  houseStatusBlockReason,
  statusNeedsReason,
} from "@/components/infrastructure/HouseStatusPicker";
import { LevelList } from "@/components/infrastructure/LevelList";
import { NameSheet } from "@/components/infrastructure/NameSheet";
import { HouseTile } from "@/components/infrastructure/SiteCards";
import type { InfrastructureCapabilities } from "@/lib/capabilities";
import { createHouse, fetchHouses, renameHouse, type HouseCard } from "@/lib/infrastructureApi";
import { infrastructureErrorMessage } from "@/lib/infrastructureErrors";
import { useEntitySheet } from "@/lib/useEntitySheet";

/**
 * المستوى الثالث — عنابر المزرعة المرئية. **لا تخطّي بعده**: العنبر هو
 * الوحدة الأساسية، وما تحته (الدفعات والسجلات) خارج هذه الشاشة.
 *
 * **وشبكة لا قائمة** (§5-د/2، القرار رقم 178): `layout="grid"` وحده يغيّر
 * الترتيب، والحالات الأربع تبقى في `LevelList` مشتركة مع المستويين الآخرين.
 * وهذا المستوى وحده يمرّرها.
 */
export function HousesLevel({
  token,
  farmId,
  farmName,
  capabilities,
}: {
  token: string;
  farmId: number;
  /** يُسمّى في زرّ الإضافة — «إضافة عنبر إلى ‹اسم المزرعة›» لا «إضافة» وحدها. */
  farmName: string;
  capabilities: InfrastructureCapabilities;
}) {
  const query = useQuery({
    queryKey: ["houses", farmId],
    queryFn: () => fetchHouses(token, farmId),
  });
  const { form, status, setStatus, reason, setReason, startCreate } = useHouseForm(token, farmId);

  return (
    <>
      <LevelList
        items={query.data}
        isLoading={query.isPending}
        error={query.isError ? infrastructureErrorMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        emptyMessage="لا عنابر مُسندة إليك في هذه المزرعة"
        {...(capabilities.canCreate
          ? { createLabel: `إضافة عنبر إلى ${farmName}`, onCreate: startCreate }
          : {})}
        keyOf={(house) => house.id}
        layout="grid"
        renderItem={(house) => (
          <HouseTile
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
      <HouseSheet
        form={form}
        status={status}
        setStatus={setStatus}
        reason={reason}
        setReason={setReason}
      />
    </>
  );
}

/**
 * ورقةُ العنبر — **الحالة في الإنشاء وحده**.
 *
 * **وتغييرها بعد الإنشاء مسارٌ آخر بآلته** (القرار 220):
 * `PATCH /houses/:id/status` بجدوله وحرّاسه — **فورقةُ التعديل تبقى اسمًا
 * وحده ولا تمسّ الحالة إطلاقًا**.
 */
function HouseSheet({
  form,
  status,
  setStatus,
  reason,
  setReason,
}: {
  form: ReturnType<typeof useHouseForm>["form"];
  status: HouseCreatableStatus | null;
  setStatus: (next: HouseCreatableStatus) => void;
  reason: string;
  setReason: (next: string) => void;
}) {
  return (
    <NameSheet
      form={form}
      createTitle="عنبر جديد"
      editTitle="تعديل العنبر"
      label="اسم العنبر"
      initialValue={form.editing?.name ?? ""}
      blockSubmit={form.isEditing ? null : houseStatusBlockReason(status, reason)}
    >
      {form.isEditing ? null : (
        <HouseStatusPicker
          selected={status}
          onSelect={setStatus}
          reason={reason}
          onChangeReason={setReason}
        />
      )}
    </NameSheet>
  );
}

/**
 * ورقة العنبر — الاسم والحالة الابتدائية معًا (القرار 226).
 *
 * **والحالة تُصفَّر مع فتح الورقة لا داخلها** — نمط `useFarmForm`: **ورقةٌ
 * تُفتح ثانيةً وقد بقي فيها اختيارُ المرة الأولى تُعيد الادّعاء الذي مُنع**
 * (القرار 186)، فالمستخدم يجد جاهزيةً لم يخترها هذه المرة.
 */
function useHouseForm(token: string, farmId: number) {
  const client = useQueryClient();
  const [status, setStatus] = useState<HouseCreatableStatus | null>(null);
  const [reason, setReason] = useState("");

  const form = useEntitySheet<HouseCard>({
    save: (name, editing) => {
      if (editing !== null) return renameHouse(token, editing.id, name);
      if (status === null) throw new Error("لا حالة مختارة — الحفظ محجوب بسببه");
      return createHouse(token, farmId, {
        name,
        status,
        // **لا يُرسَل سببٌ لحالةٍ لا توجبه** — القرار 222
        ...(statusNeedsReason(status) ? { reason } : {}),
      });
    },
    afterSave: () => client.invalidateQueries({ queryKey: ["houses", farmId] }),
  });

  return {
    form,
    status,
    setStatus,
    reason,
    setReason,
    startCreate: (): void => {
      setStatus(null);
      setReason("");
      form.openCreate();
    },
  };
}
