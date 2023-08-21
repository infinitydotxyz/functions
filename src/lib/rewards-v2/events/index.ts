import { OrderCreatedEvent, OrderCompletedEvent } from './orders';
import { ReferralEvent } from './referral';
import { SaleEvent } from "./sale";

export {
  OrderCreatedEvent,
  OrderCompletedEvent,
  ReferralEvent,
  SaleEvent,
}
export type RewardsV2Events = OrderCreatedEvent | OrderCompletedEvent | ReferralEvent | SaleEvent;
