import { useEffect, useState, type ReactNode } from "react";

import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";

/** زر معطّل لا يُستدعى — `disabledReason` وحده يمنع الضغط (§8.2). */
function noop(): void {
  // مقصود: الزر معطّل بسبب مكتوب، فلا فعل خلفه
}

interface EntityFormSheetProps {
  visible: boolean;
  title: string;
  label: string;
  initialValue: string;
  saving: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSubmit: (name: string) => void;
  /** حقول إضافية فوق زر الحفظ — مصادر الطاقة للمزرعة مثلًا. */
  children?: ReactNode;
}

/**
 * ورقة إنشاء/تعديل باسم واحد — تخدم المستويات الثلاثة.
 *
 * **التحقق من الاسم هنا لا في كل مستوى**: اسم فارغ لا يُرسَل أصلًا، تطبيقًا
 * لقاعدة «لا زر يفشل عند الضغط» (§11) — والخادم يبقى الحارس الأخير.
 */
export function EntityFormSheet({
  visible,
  title,
  label,
  initialValue,
  saving,
  errorMessage,
  onClose,
  onSubmit,
  children,
}: EntityFormSheetProps) {
  const [name, setName] = useState(initialValue);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (visible) {
      setName(initialValue);
      setTouched(false);
    }
  }, [visible, initialValue]);

  const trimmed = name.trim();
  const localError = touched && trimmed === "" ? "الاسم مطلوب" : null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <FormField
        label={label}
        type="text"
        value={name}
        onChangeText={setName}
        error={localError ?? errorMessage ?? undefined}
        testID="entity-form-name"
      />
      {children}
      {saving ? (
        <Button label="حفظ" variant="primary" formSize onPress={noop} disabledReason="جارٍ الحفظ" />
      ) : (
        <Button
          label="حفظ"
          variant="primary"
          formSize
          onPress={() => {
            setTouched(true);
            if (trimmed !== "") onSubmit(trimmed);
          }}
        />
      )}
    </BottomSheet>
  );
}
