import { RewardPhase as IRewardPhase, RewardProgram } from "./epoch.type";

export class RewardPhase {
    constructor(protected _rewardPhase: IRewardPhase) {};

    get isActive(): boolean {
        const tradingFeeProgram = this._rewardPhase[RewardProgram.TradingFee];
        if(!tradingFeeProgram) {
            return true;
        }

        return tradingFeeProgram.rewardSupplyUsed < tradingFeeProgram.rewardSupply;
    }

    toJSON(): IRewardPhase {
        return  {
            ...this._rewardPhase,
            isActive: this.isActive,
        }
    }

    getRewardProgram(program: RewardProgram): IRewardPhase[RewardProgram] {
        return this._rewardPhase[program];
    }
}