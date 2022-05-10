import { OrderItemCollectionAddressConstraint } from './address-constraint';
import { OrderItemChainIdConstraint } from './chain-id-constraint';
import { OrderItemEndTimeConstraint } from './end-time-constraint';
import { OrderItemNumTokensConstraint } from './num-tokens-constraint';
import { OrderItemOrderSideConstraint } from './order-side-constraint';
import { OrderItemOrderStatusConstraint } from './order-status-constraint';
import { OrderItemPriceConstraint } from './price-constraint';
import { OrderItemStartTimeConstraint } from './start-time-constraint';
import { OrderItemTokenIdConstraint } from './token-id-constraint';

export type Constraint =
  typeof OrderItemOrderStatusConstraint |
  typeof OrderItemOrderSideConstraint |
  typeof OrderItemChainIdConstraint |
  typeof OrderItemCollectionAddressConstraint |
  typeof OrderItemTokenIdConstraint |
  typeof OrderItemNumTokensConstraint |
  typeof OrderItemEndTimeConstraint |
  typeof OrderItemStartTimeConstraint |
  typeof OrderItemPriceConstraint;


export const constraints = [
    OrderItemOrderStatusConstraint,
    OrderItemOrderSideConstraint,
    OrderItemChainIdConstraint,
    OrderItemCollectionAddressConstraint,
    OrderItemTokenIdConstraint,
    OrderItemNumTokensConstraint,
    OrderItemEndTimeConstraint,
    OrderItemStartTimeConstraint,
    OrderItemPriceConstraint
]