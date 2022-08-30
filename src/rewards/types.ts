import { RewardEvent } from '@infinityxyz/lib/types/core';
import { RewardPhase } from './reward-phase';

export interface RewardProgramEventHandler {
  onEvent(
    event: RewardEvent,
    phase: RewardPhase
  ): {
    applicable: boolean;
    phase: RewardPhase;
    saveEvent: (txn: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore) => void;
    split?: { current: RewardEvent; remainder: RewardEvent };
  };
}
