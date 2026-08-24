import { Calendar, ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { color, font, radius, spacing } from "@/constants/theme";

export type FormFieldType = "text" | "longText" | "select" | "date";

interface FormFieldProps {
  label: string;
  type: FormFieldType;
  value?: string;
  onChangeText?: (text: string) => void;
  onPress?: () => void;
  /** رسالة الخطأ — تحت الحقل مباشرة (§8.11). وجودها يفعّل حالة الخطأ. */
  error?: string;
  disabled?: boolean;
  /** يفرض مظهر التركيز بلا تفاعل فعلي — لصفحة عرض نظام التصميم فقط. */
  forceFocusedStyle?: boolean;
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
        <TextInput
          value={value}
          onChangeText={onChangeText}
          editable={!disabled}
          multiline={type === "longText"}
          onFocus={() => {
            setIsFocused(true);
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          style={[
            styles.field,
            styles.textInput,
            type === "longText" && styles.textInputLong,
            fieldColors,
          ]}
          textAlign="right"
        />
      )}

      {hasError ? <Text style={styles.error}>{error}</Text> : null}
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
    minHeight: 52,
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
