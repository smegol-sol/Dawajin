import type React from "react";

import { FeedBlock } from "@/components/daily-log/FeedBlock";
import { MeasurementsBlock } from "@/components/daily-log/MeasurementsBlock";
import { MortalityBlock } from "@/components/daily-log/MortalityBlock";
import { FormField } from "@/components/ui/FormField";
import {
  addFeedRow,
  draftPatchKeys,
  feedRowPatchKeys,
  newClientId,
  patchFeedRow,
  removeFeedRow,
  rowErrors,
  sampleError,
  type DailyLogDraft,
  type FieldError,
} from "@/lib/dailyLogForm";
import type { HouseCard } from "@/lib/infrastructureApi";

/** **حقولُ النموذج — تدفّقٌ رأسيّ واحد متصل** (§2)، مفصولةٌ عن حالة الحفظ. */
export function Fields({
  draft,
  setDraft,
  products,
  house,
  logDate,
  shown,
  clearErrors,
}: {
  draft: DailyLogDraft;
  setDraft: React.Dispatch<React.SetStateAction<DailyLogDraft>>;
  products: React.ComponentProps<typeof FeedBlock>["products"];
  house: HouseCard;
  logDate: string;
  shown: readonly FieldError[];
  clearErrors: (...keys: readonly string[]) => void;
}) {
  const patch = (next: Partial<DailyLogDraft>): void => {
    setDraft((current) => ({ ...current, ...next }));
    clearErrors(...draftPatchKeys(next));
  };

  return (
    <>
      {/* **التاريخ معطَّل، وحدُّه معلن (قاعدة 268): لا منتقيَ تاريخٍ في
          المستودع اليوم — فالتسجيل على تاريخ الجهاز وحده، ويسقط الحدّ يوم
          يُبنى أوّلُ منتقٍ.** */}
      <FormField label="تاريخ السجل" type="date" value={logDate} disabled />
      <MortalityBlock
        count={draft.mortalityCount}
        cause={draft.mortalityCause}
        onCountChange={(mortalityCount) => {
          patch({ mortalityCount });
        }}
        onCauseChange={(mortalityCause) => {
          patch({ mortalityCause });
        }}
      />
      <FeedBlock
        rows={draft.feedRows}
        products={products}
        errorsOf={(rowKey) => rowErrors(shown, rowKey)}
        onChange={(key, rowPatch) => {
          setDraft((current) => patchFeedRow(current, key, rowPatch));
          clearErrors(...feedRowPatchKeys(key, rowPatch));
        }}
        onAdd={() => {
          setDraft((current) => addFeedRow(current, newClientId()));
        }}
        onRemove={(key) => {
          setDraft((current) => removeFeedRow(current, key));
        }}
      />
      <Measurements draft={draft} house={house} shown={shown} onChange={patch} />
    </>
  );
}

/**
 * **القياسات — مفصولةٌ لأن الحدّ يُحترم بالفصل لا برفعه** (`max-lines-per-function`).
 *
 * **وسعةُ الخزان تُحوَّل هنا لا في المكوّن**: الخادم يُرسلها نصًّا عشريًّا،
 * **والمكوّن يحسب بها** — فالتحويلُ عند الحدّ لا داخله.
 */
function Measurements({
  draft,
  house,
  shown,
  onChange,
}: {
  draft: DailyLogDraft;
  house: HouseCard;
  shown: readonly FieldError[];
  onChange: (next: Partial<DailyLogDraft>) => void;
}) {
  const message = sampleError(shown);
  return (
    <MeasurementsBlock
      draft={draft}
      {...(message === undefined ? {} : { sampleError: message })}
      tankCapacityL={house.waterTankCapacityL === null ? null : Number(house.waterTankCapacityL)}
      onChange={onChange}
    />
  );
}
