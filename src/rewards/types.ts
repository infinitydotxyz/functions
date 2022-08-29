import { CurationLedgerEvents } from '@infinityxyz/lib/types/core';
import { RewardPhase } from './reward-phase';

export interface RewardProgramEventHandler {
  onEvent(
    event: RawRewardEvent,
    phase: RewardPhase
  ): {
    applicable: boolean;
    phase: RewardPhase;
    saveEvent: (txn: FirebaseFirestore.Transaction) => void;
    split?: { current: RawRewardEvent, remainder: RawRewardEvent };
  };
}

export type RawRewardEvent = CurationLedgerEvents;
