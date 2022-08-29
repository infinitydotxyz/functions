import { RewardEpoch, RewardProgram, RewardType } from "./epoch.type";

export const epoch1: RewardEpoch = {
    name: "Epoch 1",
    isActive: false,
    startsAt: Number.MAX_SAFE_INTEGER,
    phases: [
        {
            name: 'Phase 1',
            isActive: false,
            [RewardProgram.TradingFee]: {
                maxReward: Number.POSITIVE_INFINITY,
                rewardRateNumerator: 50,
                rewardRateDenominator: 1,
                rewardType: RewardType.ERC20,
                rewardSupply: 40_000_000,
                rewardSupplyUsed: 0,
            },
            [RewardProgram.NftReward]: {
                maxReward: 1,
                rewardRateNumerator: 1,
                rewardRateDenominator: 3, // ETH
                rewardType: RewardType.ERC721,
                rewardSupply: Number.POSITIVE_INFINITY,
                rewardSupplyUsed: 0,
            },
            [RewardProgram.Curation]: false,
        },
        {
            name: 'Phase 2',
            isActive: false,
            [RewardProgram.TradingFee]: {
                maxReward: Number.POSITIVE_INFINITY,
                rewardRateNumerator: 33,
                rewardRateDenominator: 1,
                rewardType: RewardType.ERC20,
                rewardSupply: 60_000_000,
                rewardSupplyUsed: 0,
            },
            [RewardProgram.NftReward]: {
                maxReward: 1,
                rewardRateNumerator: 1,
                rewardRateDenominator: 5, // ETH
                rewardType: RewardType.ERC721,
                rewardSupply: Number.POSITIVE_INFINITY,
                rewardSupplyUsed: 0,
            },
            [RewardProgram.Curation]: false,
        },
        {
            name: 'Phase 3',
            isActive: false,
            [RewardProgram.TradingFee]: {
                maxReward: Number.POSITIVE_INFINITY,
                rewardRateNumerator: 25,
                rewardRateDenominator: 1,
                rewardType: RewardType.ERC20,
                rewardSupply: 80_000_000,
                rewardSupplyUsed: 0,
            },
            [RewardProgram.NftReward]: {
                maxReward: 1,
                rewardRateNumerator: 1,
                rewardRateDenominator: 10, // ETH
                rewardType: RewardType.ERC721,
                rewardSupply: Number.POSITIVE_INFINITY,
                rewardSupplyUsed: 0,
            },
            [RewardProgram.Curation]: false,
        },

        {
            name: 'Phase 4',
            isActive: false,
            [RewardProgram.TradingFee]: {
                maxReward: Number.POSITIVE_INFINITY,
                rewardRateNumerator: 20,
                rewardRateDenominator: 1,
                rewardType: RewardType.ERC20,
                rewardSupply: 100_000_000,
                rewardSupplyUsed: 0,
            },
            [RewardProgram.NftReward]: {
                maxReward: 1,
                rewardRateNumerator: 1,
                rewardRateDenominator: 20, // ETH
                rewardType: RewardType.ERC721,
                rewardSupply: Number.POSITIVE_INFINITY,
                rewardSupplyUsed: 0,
            },
            [RewardProgram.Curation]: false,
        },   
    ]
}

export const epoch2: RewardEpoch = {
    name: "Epoch 2",
    isActive: false,
    startsAt: Number.MAX_SAFE_INTEGER,
    phases: [
        {
            name: 'Phase 5',
            isActive: false,
            [RewardProgram.TradingFee]: {
                maxReward: Number.POSITIVE_INFINITY,
                rewardRateNumerator: 10,
                rewardRateDenominator: 1,
                rewardType: RewardType.ERC20,
                rewardSupply: 140_000_000,
                rewardSupplyUsed: 0,
            },
            [RewardProgram.NftReward]: null,
            [RewardProgram.Curation]: true,
        },
    ]
}

export const epoch3: RewardEpoch = {
    name: "Epoch 3",
    isActive: false,
    startsAt: Number.MAX_SAFE_INTEGER,
    phases: [
        {
            name: 'Phase 6',
            isActive: false,
            [RewardProgram.TradingFee]: null,
            [RewardProgram.NftReward]: null,
            [RewardProgram.Curation]: true,
        },
    ]
}

export const epochs = [epoch1, epoch2, epoch3];
