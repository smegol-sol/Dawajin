import { Calendar, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";

import { color, component, font, radius, spacing } from "@/constants/theme";

export type FormFieldType = "text" | "longText" | "select" | "date";

interface FormFieldProps {
  label: string;
  type: FormFieldType;
  value?: string;
  onChangeText?: (text: string) => void;
  onPress?: () => void;
  /**
   * رسالة الخطأ — تحت الحقل مباشرة (§8.11). وجودها يفعّل حالة الخطأ.
   * `| undefined` صريح: `exactOptionalPropertyTypes` يفرّق بين "غائبة"
   * و"موجودة بقيمة undefined"، والشاشات تمرّرها محسوبة لا شرطية.
   */
  error?: string | undefined;
  disabled?: boolean;
  /** يفرض مظهر التركيز بلا تفاعل فعلي — لصفحة عرض نظام التصميم فقط. */
  forceFocusedStyle?: boolean;
  /**
   * إخفاء المحرَف المُدخَل — حقول كلمة المرور. الحقل يبقى نفس المكوّن بنفس
   * الحالات الأربع؛ "كلمة المرور" ليست نوع حقل خامسًا بل خاصية عرض على
   * حقل النص (§8.11 تعدّ أربعة أنواع لا خمسة).
   */
  secureTextEntry?: boolean;
  /**
   * لوحة المفاتيح المطلوبة — `phone-pad` لرقم الجوال. الأرقام تبقى لاتينية
   * دائمًا (§10 قاعدة 2 و§12)، ولوحة الأرقام تمنع الأرقام العربية-الهندية
   * من المصدر لا بالتصحيح بعد الإدخال.
   */
  keyboardType?: KeyboardTypeOptions;
  /** تلميح الإكمال التلقائي لمدير كلمات المرور على الجهاز. */
  autoComplete?: "tel" | "current-password" | "new-password" | "off";
  /** معرّف الاختبار — يُمرَّر لحقل الإدخال نفسه لا للحاوية. */
  testID?: string;
}

/**
 * حقول النموذج — نص · نص طويل · قائمة اختيار · تاريخ (docs/app-complete-spec.md
 * §8.11). التسمية فوق الحقل دائمًا، رسالة الخطأ تحته مباشرة. أربع حالات:
 * عادي · مركّز · خطأ · معطّل.
 */
export function FormField({
  label,
  type,
  value,
  onChangeText,
  onPress,
  error,
  disabled = false,
  forceFocusedStyle = false,
  secureTextEntry = false,
  keyboardType,
  autoComplete,
  testID,
}: FormFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const focused = forceFocusedStyle || isFocused;
  const hasError = error !== undefined;
  const fieldColors = {
    borderColor: borderColorFor({ disabled, hasError, focused }),
    backgroundColor: disabled ? color.surfaceSunken : color.surfaceCard,
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      {type === "select" || type === "date" ? (
        <PickerField
          type={type}
          value={value}
          disabled={disabled}
          onPress={onPress}
          fieldColors={fieldColors}
        />
      ) : (
        <TextField
          label={label}
          long={type === "longText"}
          value={value}
          onChangeText={onChangeText}
          disabled={disabled}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoComplete={autoComplete}
          testID={testID}
          fieldColors={fieldColors}
          onFocusChange={setIsFocused}
        />
      )}

      {hasError ? (
        <Text
          style={styles.error}
          testID={testID === undefined ? undefined : `${testID}-error`}
          accessibilityRole="alert"
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function borderColorFor({
  disabled,
  hasError,
  focused,
}: {
  disabled: boolean;
  hasError: boolean;
  focused: boolean;
}): string {
  if (disabled) return color.borderSubtle;
  if (hasError) return color.statusCritical;
  if (focused) return color.accentSuccess;
  return color.borderSubtle;
}

/**
 * حقل الإدخال النصي — مفصول عن `FormField` كي يبقى كلاهما تحت حدّي الطول
 * والتعقيد (القرار #61)، بنفس نمط `PickerField` الموجود أصلًا.
 */
function TextField({
  label,
  long,
  value,
  onChangeText,
  disabled,
  secureTextEntry,
  keyboardType,
  autoComplete,
  testID,
  fieldColors,
  onFocusChange,
}: {
  label: string;
  long: boolean;
  value?: string | undefined;
  onChangeText?: ((text: string) => void) | undefined;
  disabled: boolean;
  secureTextEntry: boolean;
  keyboardType?: KeyboardTypeOptions | undefined;
  autoComplete?: FormFieldProps["autoComplete"];
  testID?: string | undefined;
  fieldColors: { borderColor: string; backgroundColor: string };
  onFocusChange: (focused: boolean) => void;
}) {
  // الأرقام لاتينية بـdirection: ltr (§10 قاعدة 2) — على حقل الجوال وحده،
  // لا على حقول النص العربي
  const isNumeric = keyboardType === "phone-pad";

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      editable={!disabled}
      multiline={long}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoComplete={autoComplete}
      autoCapitalize="none"
      testID={testID}
      accessibilityLabel={label}
      onFocus={() => {
        onFocusChange(true);
      }}
      onBlur={() => {
        onFocusChange(false);
      }}
      style={[
        styles.field,
        styles.textInput,
        long && styles.textInputLong,
        isNumeric && styles.ltrInput,
        fieldColors,
      ]}
      textAlign={isNumeric ? "left" : "right"}
    />
  );
}

function PickerField({
  type,
  value,
  disabled,
  onPress,
  fieldColors,
}: {
  type: Extract<FormFieldType, "select" | "date">;
  value?: string | undefined;
  disabled: boolean;
  onPress?: (() => void) | undefined;
  fieldColors: { borderColor: string; backgroundColor: string };
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[styles.field, styles.pressableField, fieldColors]}
    >
      <Text style={[styles.value, !value && styles.placeholder]}>
        {value ?? (type === "date" ? "اختر التاريخ" : "اختر من القائمة")}
      </Text>
      {type === "date" ? (
        <Calendar color={color.textBody} size={20} />
      ) : (
        <ChevronDown color={color.textBody} size={20} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  label: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.brandPrimary,
    writingDirection: "rtl",
    textAlign: "right",
  },
  field: {
    // القرار: كان نطاقًا 52-56 في الوثيقة، حُسم على 56 (= touchTarget.primary،
    // لا رقم مستقل) — يوحّد الحقول مع بقية عناصر اللمس القياسية.
    minHeight: component.field.height,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: spacing.md,
  },
  textInput: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.brandPrimary,
    paddingVertical: spacing.sm,
    writingDirection: "rtl",
  },
  ltrInput: {
    direction: "ltr",
    writingDirection: "ltr",
  },
  textInputLong: {
    minHeight: 96,
    textAlignVertical: "top",
    paddingTop: spacing.sm,
  },
  pressableField: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  value: {
    fontSize: font.size.content,
    fontFamily: font.familyRegular,
    color: color.brandPrimary,
    writingDirection: "rtl",
  },
  placeholder: {
    color: color.textBody,
  },
  error: {
    fontSize: font.size.technicalRef,
    fontFamily: font.familyRegular,
    color: color.statusCritical,
    writingDirection: "rtl",
    textAlign: "right",
  },
});
