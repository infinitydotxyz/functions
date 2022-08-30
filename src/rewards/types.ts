import { InfinityNftSale } from '@infinityxyz/lib/types/core';
import { RewardPhase } from './reward-phase';

export interface RewardProgramEventHandler {
  onEvent(
    event: RawRewardEvent,
    phase: RewardPhase
  ): {
    applicable: boolean;
    phase: RewardPhase;
    saveEvent: (txn: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore) => void;
    split?: { current: RawRewardEvent; remainder: RawRewardEvent };
  };
}

type Split<T> = T & { isSplit?: true };

export type RewardSaleEvent = Split<InfinityNftSale & { ethPrice: number }>;

export type RawRewardEvent = RewardSaleEvent;
