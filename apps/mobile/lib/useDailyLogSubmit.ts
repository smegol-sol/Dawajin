import { useCallback, useState } from "react";

import { submitDailyLog, type DailyLogResult } from "./dailyLogApi";
import { dailyLogErrorMessage } from "./dailyLogErrors";
import { buildRequest, newClientId, type DailyLogDraft } from "./dailyLogForm";

/**
 * **حفظُ السجل — والعطالةُ فيه لا في الزرّ** (§14.1، والقرار 278).
 *
 * **ومعرّفُ العميل يُولَّد مرةً لكل محاولةِ حفظٍ ويُعاد استعماله في إعادة
 * الإرسال** — **فالطلب المكرَّر يعود بـ200 و`duplicate: true` ولا يُنشئ
 * سجلًّا ثانيًا**. **وتوليدُه في كل ضغطةٍ كان يُبطل العطالة من أصلها**:
 * شبكةٌ تنقطع بعد وصول الطلب ثم إعادةُ ضغطٍ تُنشئ سجلَّين.
 *
 * **ويُجدَّد بعد نجاحٍ صريح** (`reset`) — فسجلُّ يومٍ آخر معرّفُه آخر.
 */
export interface DailyLogSubmitState {
  save: (draft: DailyLogDraft) => void;
  reset: () => void;
  saved: DailyLogResult | undefined;
  failure: string | undefined;
  pending: boolean;
}

export function useDailyLogSubmit(args: {
  token: string;
  houseId: number;
  logDate: string;
  tankCapacityL: string | null;
}): DailyLogSubmitState {
  const [clientId, setClientId] = useState(newClientId);
  const [saved, setSaved] = useState<DailyLogResult | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const { token, houseId, logDate, tankCapacityL } = args;

  const save = useCallback(
    (draft: DailyLogDraft) => {
      setPending(true);
      setFailure(undefined);
      submitDailyLog(
        token,
        buildRequest({
          draft,
          houseId,
          logDate,
          clientId,
          hasTankCapacity: tankCapacityL !== null,
        })
      )
        .then((result) => {
          setSaved(result);
        })
        .catch((error: unknown) => {
          setFailure(dailyLogErrorMessage(error));
        })
        .finally(() => {
          setPending(false);
        });
    },
    [token, houseId, logDate, clientId, tankCapacityL]
  );

  const reset = useCallback(() => {
    setSaved(undefined);
    setFailure(undefined);
    setClientId(newClientId());
  }, []);

  return { save, reset, saved, failure, pending };
}
