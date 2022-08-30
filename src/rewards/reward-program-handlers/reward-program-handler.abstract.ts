import { RewardPhase } from '../reward-phase';
import {
  RawRewardEvent,
  RewardProgramEventHandler,
  RewardSaleEvent,
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
    } else {
      console.log(JSON.stringify(event, null, 2));
      throw new Error(`Unknown event ${(event as any)?.discriminator}`);
    }
  }

  abstract onSale(sale: RewardSaleEvent, phase: RewardPhase): RewardProgramEventHandlerResponse;

  protected _nonApplicableResponse(phase: RewardPhase): RewardProgramEventHandlerResponse {
    return {
      applicable: false,
      phase,
      saveEvent: () => {
        return;
      },
      split: undefined
    };
  }
}
