import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { infrastructureErrorMessage } from "./infrastructureErrors";

/**
 * حالة ورقة الإنشاء/التعديل ومنطق حفظها — **مشتركة بين المستويات الثلاثة**.
 *
 * بلا هذا يتكرّر نفس الشيء ثلاث مرات (حالة الورقة · طفرة الحفظ · إبطال
 * الذاكرة · تحويل الخطأ لرسالة)، فيتباعد أحدها لاحقًا: تُصلَح رسالة خطأ في
 * المواقع وتبقى الأخرى كما هي.
 *
 * `editing` هو الكيان الجاري تعديله، أو `null` للإنشاء — والفرق بينه وبين
 * «الورقة مغلقة» (`sheet === null`) مقصود.
 */
export interface EntitySheet<T> {
  editing: T | null;
}

export function useEntitySheet<T>(options: {
  save: (name: string, editing: T | null) => Promise<void>;
  afterSave: () => Promise<void>;
}) {
  const [sheet, setSheet] = useState<EntitySheet<T> | null>(null);

  const mutation = useMutation({
    mutationFn: (name: string) => options.save(name, sheet?.editing ?? null),
    onSuccess: async () => {
      setSheet(null);
      await options.afterSave();
    },
  });

  return {
    open: sheet !== null,
    isEditing: sheet?.editing != null,
    editing: sheet?.editing ?? null,
    openCreate: (): void => {
      setSheet({ editing: null });
    },
    openEdit: (entity: T): void => {
      setSheet({ editing: entity });
    },
    close: (): void => {
      setSheet(null);
    },
    submit: (name: string): void => {
      mutation.mutate(name);
    },
    saving: mutation.isPending,
    errorMessage: mutation.isError ? infrastructureErrorMessage(mutation.error) : null,
  };
}
