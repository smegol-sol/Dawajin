import type { ReactNode } from "react";

import { EntityFormSheet } from "@/components/infrastructure/EntityFormSheet";

interface NameSheetForm {
  /** هل الورقة مفتوحة؟ — علم صريح بدل تسريب شكل الحالة الداخلية للورقة. */
  open: boolean;
  isEditing: boolean;
  saving: boolean;
  errorMessage: string | null;
  close: () => void;
  submit: (name: string) => void;
}

/**
 * يربط `useEntitySheet` بورقة النموذج — الوصلة نفسها في المستويات الثلاثة،
 * فتُكتب مرة. الفرق بينها اسمان ونص العنوان، لا منطق.
 */
export function NameSheet({
  form,
  createTitle,
  editTitle,
  label,
  initialValue,
  extraError,
  children,
  blockSubmit,
}: {
  form: NameSheetForm;
  createTitle: string;
  editTitle: string;
  label: string;
  initialValue: string;
  /** خطأ إضافي يخصّ حقلًا آخر في الورقة — مصادر الطاقة مثلًا. */
  extraError?: string | null;
  children?: ReactNode;
  /** سببُ تعطيل الحفظ حين ينقص حقلٌ إضافيّ — يمرّ كما هو إلى الورقة. */
  blockSubmit?: string | null | undefined;
}) {
  return (
    <EntityFormSheet
      visible={form.open}
      title={form.isEditing ? editTitle : createTitle}
      label={label}
      initialValue={initialValue}
      saving={form.saving}
      errorMessage={form.errorMessage ?? extraError ?? null}
      onClose={form.close}
      onSubmit={form.submit}
      blockSubmit={blockSubmit}
    >
      {children}
    </EntityFormSheet>
  );
}
