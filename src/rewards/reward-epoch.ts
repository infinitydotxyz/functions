import { RewardEpoch as IRewardEpoch } from '@infinityxyz/lib/types/core';
import { RewardPhase } from './reward-phase';

export class RewardEpoch {
  protected _rewardEpoch: Omit<IRewardEpoch, 'phases'> & { phases: RewardPhase[] };
  constructor(rewardEpoch: IRewardEpoch) {
    const { phases, ...metadata } = rewardEpoch;
    this._rewardEpoch = {
      ...metadata,
      phases: phases.map((item) => new RewardPhase(item))
    };
  }

  get phases(): RewardPhase[] {
    return this._rewardEpoch.phases;
  }

  get isActive(): boolean {
    const currentPhase = this._rewardEpoch.phases?.find((item) => item.isActive);
    if (!currentPhase) {
      return false;
    }

    return this._rewardEpoch.startsAt < Date.now();
  }

  toJSON(): IRewardEpoch {
    const { phases, ...metadata } = this._rewardEpoch;
    return {
      ...metadata,
      phases: phases.map((item) => item.toJSON()),
      isActive: this.isActive
    };
  }
}
