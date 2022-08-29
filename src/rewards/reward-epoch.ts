import { RewardEpoch as IRewardEpoch } from "./epoch.type";
import { RewardPhase } from "./reward-phase";

export class RewardEpoch {
    constructor(protected _rewardEpoch: Omit<IRewardEpoch, 'phases'> & {phases: RewardPhase[]} ) {};

    get isActive(): boolean {
        const currentPhase = this._rewardEpoch.phases?.find((item) => item.isActive);
        if(!currentPhase) {
            return false;
        }

        return this._rewardEpoch.startsAt > Date.now();
    }
    
    toJSON(): IRewardEpoch {
        const { phases, ...metadata } = this._rewardEpoch;
        return  {
            ...metadata,
            phases: phases.map((item) => item.toJSON()),
            isActive: this.isActive,
        }
    }
}