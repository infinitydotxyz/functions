import { CurationLedgerEvent } from '@infinityxyz/lib/types/core';
import { RewardPhase } from '../reward-phase';
import {
  RawRewardEvent,
  RewardProgramEventHandler,
  RewardSaleEvent,
  RewardVoteEvent,
  RewardVotesRemovedEvent
} from '../types';

export type RewardProgramEventHandlerResponse = {
  applicable: boolean;
  phase: RewardPhase;
  saveEvent: (txn: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore) => void;
  split?: { current: RawRewardEvent; remainder: RawRewardEvent } | undefined;
};

export abstract class RewardProgramHandler implements RewardProgramEventHandler {
  onEvent(event: RawRewardEvent, phase: RewardPhase): RewardProgramEventHandlerResponse {
    if ('txHash' in event && 'price' in event && 'buyer' in event && 'seller' in event) {
      return this.onSale(event, phase);
    } else if ('discriminator' in event) {
      switch (event.discriminator) {
        case CurationLedgerEvent.VotesAdded:
          return this.onVotesAdded(event, phase);
        case CurationLedgerEvent.VotesRemoved:
          return this.onVotesRemoved(event, phase);

        default:
          console.log(JSON.stringify(event, null, 2));
          throw new Error(`Unknown event ${(event as any)?.discriminator}`);
      }
    } else {
      console.log(JSON.stringify(event, null, 2));
      throw new Error(`Unknown event ${(event as any)?.discriminator}`);
    }
  }

  abstract onSale(sale: RewardSaleEvent, phase: RewardPhase): RewardProgramEventHandlerResponse;

  abstract onVotesAdded(vote: RewardVoteEvent, phase: RewardPhase): RewardProgramEventHandlerResponse;

  abstract onVotesRemoved(votes: RewardVotesRemovedEvent, phase: RewardPhase): RewardProgramEventHandlerResponse;
}
