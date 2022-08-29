import { ChainId } from "@infinityxyz/lib/types/core";

export enum RewardType {
    ERC20 = 'ERC20',
    ERC721 = 'ERC721',
    ETH = 'ETH',
}

export enum RewardProgram {
    NftReward = 'NFT_REWARD',
    Curation = 'CURATION',
    TradingFee = 'TRADING_FEE'
}

export interface TradingReward {
    maxReward: number;

    rewardRateNumerator: number;
    rewardRateDenominator: number;

    rewardType: RewardType;

    rewardSupply: number;
    rewardSupplyUsed: number;
}

export interface RewardPhase {
    name: string;
    isActive: boolean;
    [RewardProgram.TradingFee]: TradingReward | null;
    [RewardProgram.NftReward]: TradingReward | null;
    [RewardProgram.Curation]: boolean;
}

export interface RewardEpoch {
    name: string;

    startsAt: number;

    isActive: boolean;

    phases: RewardPhase[];
}

export interface RewardsProgram {
    chainId: ChainId;
    epochs: RewardEpoch[];
}
