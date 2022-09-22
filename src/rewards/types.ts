import { RewardEvent } from '@infinityxyz/lib/types/core';
import { Phase } from './phases/phase.abstract';

export type TradingFeeEventHandlerResponse = {
  applicable: boolean;
  phase: Phase;
  saveEvent: (txn: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore) => void;
  split?: { current: RewardEvent; remainder: RewardEvent } | undefined;
};

export interface TradingFeeProgramEventHandler {
  onEvent(event: RewardEvent, phase: Phase): TradingFeeEventHandlerResponse;
}
