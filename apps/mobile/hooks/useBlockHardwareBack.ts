import { useEffect } from "react";
import { BackHandler } from "react-native";

/**
 * يمنع زر الرجوع في أندرويد من مغادرة الشاشة — لشاشات لا يجوز تجاوزها
 * (تغيير كلمة المرور الإجباري). إخفاء سهم الرجوع وحده لا يكفي: زر النظام
 * منفذ تجاوز مستقل تمامًا عن الهيدر.
 *
 * الاعتراض يُرجع `true` فيُبتلع الحدث ولا يصل مكدّس التنقّل. لا أثر له على
 * iOS (لا زر رجوع نظام هناك — إيماءة السحب تُعطَّل في تعريف الشاشة نفسها).
 */
export function useBlockHardwareBack(): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => {
      subscription.remove();
    };
  }, []);
}
