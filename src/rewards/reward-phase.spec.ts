import { Epoch, Phase, RewardProgram, RewardType, RewardPhase as IRewardPhase } from '@infinityxyz/lib/types/core';
import { REWARD_BUFFER } from './constants';
import { RewardPhase } from './reward-phase';

export const getMockRewardPhaseConfig = (
  supply: number,
  supplyUsed: number,
  epoch = Epoch.One,
  phase = Phase.One
): IRewardPhase => {
  return {
    name: phase,
    epoch,
    isActive: false,
    [RewardProgram.TradingFee]: {
      maxReward: 1,
      rewardRateNumerator: 1,
      rewardRateDenominator: 1,
      rewardType: RewardType.ERC20,
      rewardSupply: supply,
      rewardSupplyUsed: supplyUsed,
      buyerPortion: 1,
      sellerPortion: 1
    },
    [RewardProgram.NftReward]: null,
    [RewardProgram.Curation]: false
  };
};

describe('RewardPhase', () => {
  it('should be active if there is not a trading fee reward program', () => {
    const phaseConfig = getMockRewardPhaseConfig(1, 0);
    phaseConfig[RewardProgram.TradingFee] = null;
    const phase = new RewardPhase(phaseConfig);
    expect(phaseConfig[RewardProgram.TradingFee]).toBe(null);
    expect(phase.isActive).toBe(true);
  });

  it('should be active if the supply used is less than the supply (including buffer)', () => {
    const phaseConfig = getMockRewardPhaseConfig(100, 0);
    const phase = new RewardPhase(phaseConfig);

    const tradingFeeRewards = phase.getRewardProgram(RewardProgram.TradingFee);
    if (tradingFeeRewards === null || typeof tradingFeeRewards === 'boolean') {
      throw new Error('Trading fee rewards are null or boolean');
    }

    expect(tradingFeeRewards.rewardSupply - REWARD_BUFFER).toBeGreaterThan(tradingFeeRewards.rewardSupplyUsed);

    expect(phase.isActive).toBe(true);
  });

  it('should be inactive if the supply used is equal to the total supply', () => {
    const phaseConfig = getMockRewardPhaseConfig(100, 100);
    const phase = new RewardPhase(phaseConfig);

    const tradingFeeRewards = phase.getRewardProgram(RewardProgram.TradingFee);
    if (tradingFeeRewards === null || typeof tradingFeeRewards === 'boolean') {
      throw new Error('Trading fee rewards are null or boolean');
    }

    expect(tradingFeeRewards.rewardSupply).toBe(tradingFeeRewards.rewardSupplyUsed);

    expect(phase.isActive).toBe(false);
  });

  it('should be inactive if the supply used is within the buffer of the reward supply', () => {
    const totalSupply = 10 * REWARD_BUFFER;
    const supplyUsed = 10 * REWARD_BUFFER - (REWARD_BUFFER / 2);
    const phaseConfig = getMockRewardPhaseConfig(totalSupply, supplyUsed);
    const phase = new RewardPhase(phaseConfig);

    const tradingFeeRewards = phase.getRewardProgram(RewardProgram.TradingFee);
    if (tradingFeeRewards === null || typeof tradingFeeRewards === 'boolean') {
      throw new Error('Trading fee rewards are null or boolean');
    }

    expect(tradingFeeRewards.rewardSupply - REWARD_BUFFER).toBeLessThan(tradingFeeRewards.rewardSupplyUsed);
    expect(tradingFeeRewards.rewardSupply).toBeGreaterThan(tradingFeeRewards.rewardSupplyUsed);

    expect(phase.isActive).toBe(false);
  });

  it('should update isActive when converting to JSON', () => {
    const phaseConfig = getMockRewardPhaseConfig(100, 0);
    const phase = new RewardPhase(phaseConfig);

    const tradingFeeRewards = phase.getRewardProgram(RewardProgram.TradingFee);
    if (tradingFeeRewards === null || typeof tradingFeeRewards === 'boolean') {
      throw new Error('Trading fee rewards are null or boolean');
    }

    expect(phaseConfig.isActive).toBe(false);

    expect(phase.isActive).toBe(true);
    expect(phase.toJSON().isActive).toBe(true);
  });
});
