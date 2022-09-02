import { Epoch, Phase, RewardProgram, RewardType } from '@infinityxyz/lib/types/core';
import { RewardEpochDto } from '@infinityxyz/lib/types/dto/rewards';

// epochs include all previous events
const startsAt = 0;

export const epoch1: RewardEpochDto = {
  name: Epoch.One,
  isActive: true,
  startsAt,
  phases: [
    {
      name: Phase.One,
      epoch: Epoch.One,
      isActive: true,
      [RewardProgram.TradingFee]: {
        maxReward: Number.POSITIVE_INFINITY,
        rewardRateNumerator: 50,
        rewardRateDenominator: 1,
        rewardType: RewardType.ERC20,
        rewardSupply: 40_000_000,
        rewardSupplyUsed: 0,
        buyerPortion: 0.7,
        sellerPortion: 0.3
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
      [RewardProgram.Curation]: false
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
        buyerPortion: 0.7,
        sellerPortion: 0.3
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
      [RewardProgram.Curation]: false
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
        buyerPortion: 0.7,
        sellerPortion: 0.3
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
      [RewardProgram.Curation]: false
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
        buyerPortion: 0.7,
        sellerPortion: 0.3
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
      [RewardProgram.Curation]: false
    }
  ]
};

export const epoch2: RewardEpochDto = {
  name: Epoch.Two,
  isActive: false,
  startsAt,
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
        rewardSupply: 100_000_000,
        rewardSupplyUsed: 0,
        buyerPortion: 0.7,
        sellerPortion: 0.3
      },
      [RewardProgram.NftReward]: null,
      [RewardProgram.Curation]: true
    }
  ]
};

export const epoch3: RewardEpochDto = {
  name: Epoch.Three,
  isActive: false,
  startsAt,
  phases: [
    {
      name: Phase.Six,
      epoch: Epoch.Three,
      isActive: false,
      [RewardProgram.TradingFee]: null,
      [RewardProgram.NftReward]: null,
      [RewardProgram.Curation]: true
    }
  ]
};

export const epochs = [epoch1, epoch2, epoch3];
