import { RewardEvent } from '@infinityxyz/lib/types/core';
import { TokenomicsPhase } from '../tokenomics/types';


export type TradingFeeEventHandlerResponse = {
  applicable: boolean;
  phase: TokenomicsPhase;
  saveEvent: (txn: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore) => void;
  split?: { current: RewardEvent; remainder: RewardEvent } | undefined;
};

export interface TradingFeeProgramEventHandler {
  onEvent(
    event: RewardEvent,
    phase: TokenomicsPhase
  ): TradingFeeEventHandlerResponse;
}
