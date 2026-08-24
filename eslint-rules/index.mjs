import noDbInRoutes from "./no-db-in-routes.mjs";
import noEnglishUserError from "./no-english-user-error.mjs";
import noFloatQuantityColumn from "./no-float-quantity-column.mjs";
import noMagicConfigNumber from "./no-magic-config-number.mjs";
import noUnvettedHouseIdReuse from "./no-unvetted-house-id-reuse.mjs";
import requireTxForMultiTableWrite from "./require-tx-for-multi-table-write.mjs";

/** قواعد ESLint المخصصة لهذا المشروع — القرار #61 في docs/decisions.md. */
export default {
  rules: {
    "no-db-in-routes": noDbInRoutes,
    "require-tx-for-multi-table-write": requireTxForMultiTableWrite,
    "no-unvetted-house-id-reuse": noUnvettedHouseIdReuse,
    "no-english-user-error": noEnglishUserError,
    "no-float-quantity-column": noFloatQuantityColumn,
    "no-magic-config-number": noMagicConfigNumber,
  },
};
