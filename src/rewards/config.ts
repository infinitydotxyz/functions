import { Epoch, Phase, RewardEpoch, RewardProgram, RewardType } from "./epoch.type";



export const epoch1: RewardEpoch = {
    name: Epoch.One,
    isActive: false,
    startsAt: Number.MAX_SAFE_INTEGER,
    phases: [
        {
            name: Phase.One,
            epoch: Epoch.One,
            isActive: false,
            [RewardProgram.TradingFee]: {
                maxReward: Number.POSITIVE_INFINITY,
                rewardRateNumerator: 50,
                rewardRateDenominator: 1,
                rewardType: RewardType.ERC20,
                rewardSupply: 40_000_000,
                rewardSupplyUsed: 0,
                buyerPortion: 0.3,
                sellerPortion: 0.7
            },
            [RewardProgram.NftReward]: {
                maxReward: 1,
                rewardRateNumerator: 1,
                rewardRateDenominator: 3, // ETH
                rewardType: RewardType.ERC721,
                rewardSupply: Number.POSITIVE_INFINITY,
                rewardSupplyUsed: 0,
                buyerPortion: 1,
                sellerPortion: 1
            },
            [RewardProgram.Curation]: false,
        },
        {
            name: Phase.Two,
            epoch: Epoch.One,
            isActive: false,
            [RewardProgram.TradingFee]: {
                maxReward: Number.POSITIVE_INFINITY,
                rewardRateNumerator: 33,
                rewardRateDenominator: 1,
                rewardType: RewardType.ERC20,
                rewardSupply: 60_000_000,
                rewardSupplyUsed: 0,
                buyerPortion: 0.3,
                sellerPortion: 0.7
            },
            [RewardProgram.NftReward]: {
                maxReward: 1,
                rewardRateNumerator: 1,
                rewardRateDenominator: 5, // ETH
                rewardType: RewardType.ERC721,
                rewardSupply: Number.POSITIVE_INFINITY,
                rewardSupplyUsed: 0,
                buyerPortion: 1,
                sellerPortion: 1
            },
            [RewardProgram.Curation]: false,
        },
        {
            name: Phase.Three,
            epoch: Epoch.One,
            isActive: false,
            [RewardProgram.TradingFee]: {
                maxReward: Number.POSITIVE_INFINITY,
                rewardRateNumerator: 25,
                rewardRateDenominator: 1,
                rewardType: RewardType.ERC20,
                rewardSupply: 80_000_000,
                rewardSupplyUsed: 0,
                buyerPortion: 0.3,
                sellerPortion: 0.7
            },
            [RewardProgram.NftReward]: {
                maxReward: 1,
                rewardRateNumerator: 1,
                rewardRateDenominator: 10, // ETH
                rewardType: RewardType.ERC721,
                rewardSupply: Number.POSITIVE_INFINITY,
                rewardSupplyUsed: 0,
                buyerPortion: 1,
                sellerPortion: 1
            },
            [RewardProgram.Curation]: false,
        },

        {
            name: Phase.Four,
            epoch: Epoch.One,
            isActive: false,
            [RewardProgram.TradingFee]: {
                maxReward: Number.POSITIVE_INFINITY,
                rewardRateNumerator: 20,
                rewardRateDenominator: 1,
                rewardType: RewardType.ERC20,
                rewardSupply: 100_000_000,
                rewardSupplyUsed: 0,
                buyerPortion: 0.3,
                sellerPortion: 0.7
            },
            [RewardProgram.NftReward]: {
                maxReward: 1,
                rewardRateNumerator: 1,
                rewardRateDenominator: 20, // ETH
                rewardType: RewardType.ERC721,
                rewardSupply: Number.POSITIVE_INFINITY,
                rewardSupplyUsed: 0,
                buyerPortion: 1,
                sellerPortion: 1
            },
            [RewardProgram.Curation]: false,
        },   
    ]
}

export const epoch2: RewardEpoch = {
    name: Epoch.Two,
    isActive: false,
    startsAt: Number.MAX_SAFE_INTEGER,
    phases: [
        {
            name: Phase.Five,
            epoch: Epoch.Two,
            isActive: false,
            [RewardProgram.TradingFee]: {
                maxReward: Number.POSITIVE_INFINITY,
                rewardRateNumerator: 10,
                rewardRateDenominator: 1,
                rewardType: RewardType.ERC20,
                rewardSupply: 140_000_000,
                rewardSupplyUsed: 0,
                buyerPortion: 0.3,
                sellerPortion: 0.7
            },
            [RewardProgram.NftReward]: null,
            [RewardProgram.Curation]: true,
        },
    ]
}

export const epoch3: RewardEpoch = {
    name: Epoch.Three,
    isActive: false,
    startsAt: Number.MAX_SAFE_INTEGER,
    phases: [
        {
            name: Phase.Six,
            epoch: Epoch.Three,
            isActive: false,
            [RewardProgram.TradingFee]: null,
            [RewardProgram.NftReward]: null,
            [RewardProgram.Curation]: true,
        },
    ]
}

export const epochs = [epoch1, epoch2, epoch3];
