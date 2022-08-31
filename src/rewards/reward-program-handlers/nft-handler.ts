import { InfinityNftSale } from '@infinityxyz/lib/types/core';
import { RewardPhase } from '../reward-phase';
import { RewardProgramEventHandlerResponse, RewardProgramHandler } from './reward-program-handler.abstract';

/**
 * nft rewards are handled by the transaction fee handler
 */
export class NftHandler extends RewardProgramHandler {
  protected _onSale(sale: InfinityNftSale, phase: RewardPhase): RewardProgramEventHandlerResponse {
    return this._nonApplicableResponse(phase);
  }
}
