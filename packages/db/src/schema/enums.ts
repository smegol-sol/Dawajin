import {
  USER_ROLE,
  BATCH_STATUS,
  BREED,
  HOUSE_STATUS,
  HOUSE_TYPE,
  MORTALITY_CAUSE,
  REVIEW_STATUS,
  FEED_STAGE,
  PRODUCT_CATEGORY,
  STOCK_UNIT,
  DOSE_BASIS,
  ROUTE,
  INVENTORY_MOVEMENT_TYPE,
  SHIPMENT_STATUS,
  SHIPMENT_VARIANCE_STATUS,
  DISPUTE_OUTCOME,
  WASTAGE_REASON,
  HEALTH_TASK_STATUS,
  HEALTH_OBSERVATION_SEVERITY,
  NOTIFICATION_URGENCY,
  SUBSCRIPTION_STATUS,
  LOCATION_TYPE,
  HEALTH_TASK_PRIORITY,
  HEALTH_OBSERVATION_STATUS,
  DISPUTE_STATUS,
  STORAGE_CONDITIONS,
} from "@dawajin/shared";
import { pgEnum } from "drizzle-orm/pg-core";

// كل قيمة enum مصدرها packages/shared — لا تُعرَّف القوائم هنا (backend-technical-spec.md §6).
export const userRoleEnum = pgEnum("user_role", USER_ROLE);
export const batchStatusEnum = pgEnum("batch_status", BATCH_STATUS);
export const breedEnum = pgEnum("breed", BREED);
export const houseStatusEnum = pgEnum("house_status", HOUSE_STATUS);
export const houseTypeEnum = pgEnum("house_type", HOUSE_TYPE);
export const mortalityCauseEnum = pgEnum("mortality_cause", MORTALITY_CAUSE);
export const reviewStatusEnum = pgEnum("review_status", REVIEW_STATUS);
export const feedStageEnum = pgEnum("feed_stage", FEED_STAGE);
export const productCategoryEnum = pgEnum("product_category", PRODUCT_CATEGORY);
export const stockUnitEnum = pgEnum("stock_unit", STOCK_UNIT);
export const doseBasisEnum = pgEnum("dose_basis", DOSE_BASIS);
export const routeEnum = pgEnum("route", ROUTE);
export const inventoryMovementTypeEnum = pgEnum("inventory_movement_type", INVENTORY_MOVEMENT_TYPE);
export const shipmentStatusEnum = pgEnum("shipment_status", SHIPMENT_STATUS);
export const shipmentVarianceStatusEnum = pgEnum(
  "shipment_variance_status",
  SHIPMENT_VARIANCE_STATUS
);
export const disputeOutcomeEnum = pgEnum("dispute_outcome", DISPUTE_OUTCOME);
export const wastageReasonEnum = pgEnum("wastage_reason", WASTAGE_REASON);
export const healthTaskStatusEnum = pgEnum("health_task_status", HEALTH_TASK_STATUS);
export const healthObservationSeverityEnum = pgEnum(
  "health_observation_severity",
  HEALTH_OBSERVATION_SEVERITY
);
export const notificationUrgencyEnum = pgEnum("notification_urgency", NOTIFICATION_URGENCY);
export const subscriptionStatusEnum = pgEnum("subscription_status", SUBSCRIPTION_STATUS);
export const locationTypeEnum = pgEnum("location_type", LOCATION_TYPE);
export const healthTaskPriorityEnum = pgEnum("health_task_priority", HEALTH_TASK_PRIORITY);
export const healthObservationStatusEnum = pgEnum(
  "health_observation_status",
  HEALTH_OBSERVATION_STATUS
);
export const disputeStatusEnum = pgEnum("dispute_status", DISPUTE_STATUS);
export const storageConditionsEnum = pgEnum("storage_conditions", STORAGE_CONDITIONS);
