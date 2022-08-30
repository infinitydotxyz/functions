import { REWARD_BUFFER } from './constants';
import { RewardPhase as IRewardPhase, RewardProgram } from '@infinityxyz/lib/types/core';

export class RewardPhase {
  constructor(protected _rewardPhase: IRewardPhase) {}

  get isActive(): boolean {
    const tradingFeeProgram = this._rewardPhase[RewardProgram.TradingFee];
    if (!tradingFeeProgram) {
      return true;
    }

    return tradingFeeProgram.rewardSupplyUsed + REWARD_BUFFER < tradingFeeProgram.rewardSupply;
  }

  toJSON(): IRewardPhase {
    return {
      ...this._rewardPhase,
      isActive: this.isActive
    };
  }

  getRewardProgram(program: RewardProgram): IRewardPhase[RewardProgram] {
    return this._rewardPhase[program];
  }
}
