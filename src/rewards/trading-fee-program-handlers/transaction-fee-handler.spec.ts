import { RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { TradingFeeRefundDto } from '@infinityxyz/lib/types/dto';
import { parseEther } from 'ethers/lib/utils';
import { Phase } from '../phases/phase.abstract';
import { TradingFeeRefundBasedPhase } from '../phases/trading-fee-refund-based-phase';
import { getMockPhaseConfig } from '../phases/trading-fee-refund-based-phase.spec';
import { TransactionFeeHandler } from './transaction-fee-handler';

class MockTransactionFeeHandler extends TransactionFeeHandler {
  getSaleReward(sale: RewardSaleEvent, tradingReward: TradingFeeRefundDto) {
    return this._getSaleReward(sale, tradingReward);
  }

  splitSale(sale: RewardSaleEvent, reward: number, phaseSupplyRemaining: number) {
    return this._splitSale(sale, reward, phaseSupplyRemaining);
  }

  getBuyerAndSellerEvents(
    sale: RewardSaleEvent,
    phase: Phase,
    buyerReward: { reward: number; protocolFeesWei: string; protocolFeesEth: number; protocolFeesUSDC: number },
    sellerReward: { reward: number; protocolFeesWei: string; protocolFeesEth: number; protocolFeesUSDC: number },
    config: TradingFeeRefundDto
  ) {
    return this._getBuyerAndSellerEvents(sale, phase, buyerReward, sellerReward, config);
  }

  onSale(sale: RewardSaleEvent, phase: Phase) {
    return this._onSale(sale, phase);
  }
}

describe('TransactionFeeHandler', () => {
  it('distributes protocol fees according to buyer and seller portions', () => {
    const sale = {
      protocolFee: 0.0000000000001,
      protocolFeeWei: parseEther('0.0000000000001'),
      ethPrice: 2000
    } as any as RewardSaleEvent;

    const tradingReward: TradingFeeRefundDto = {
      rewardRateNumerator: 2,
      rewardRateDenominator: 1,
      buyerPortion: 0.2,
      sellerPortion: 0.8,
      maxReward: 100,
      rewardSupply: 1000,
      rewardSupplyUsed: 100
    };

    const handler = new MockTransactionFeeHandler();

    const { total, buyer: buyerReward, seller: sellerReward } = handler.getSaleReward(sale, tradingReward);

    expect(buyerReward.reward).toBeCloseTo(total * tradingReward.buyerPortion);
    expect(sellerReward.reward).toBeCloseTo(total * tradingReward.sellerPortion);

    expect(total).toBeCloseTo(
      (sale.protocolFee * sale.ethPrice * tradingReward.rewardRateNumerator) / tradingReward.rewardRateDenominator
    );
  });

  it('splits the price and protocol fees', () => {
    const handler = new MockTransactionFeeHandler();
    const sale = {
      protocolFee: 1,
      protocolFeeWei: parseEther('1'),
      price: 2
    } as any as RewardSaleEvent;

    const reward = 50;
    const phaseSupplyRemaining = 25;

    const split = handler.splitSale(sale, reward, phaseSupplyRemaining);

    expect(split.current.price).toBeCloseTo(sale.price / 2);
    expect(split.current.protocolFee).toBeCloseTo(sale.protocolFee / 2);

    expect(split.remainder.price).toBeCloseTo(sale.price / 2);
    expect(split.remainder.protocolFee).toBeCloseTo(sale.protocolFee / 2);
  });

  it('sets isSplit in the resulting sale events when splitSale is called', () => {
    const handler = new MockTransactionFeeHandler();
    const sale = {
      protocolFee: 1,
      protocolFeeWei: parseEther('1'),
      price: 2
    } as any as RewardSaleEvent;

    const reward = 50;
    const phaseSupplyRemaining = 25;

    const split = handler.splitSale(sale, reward, phaseSupplyRemaining);

    expect(split.current.isSplit).toBe(true);
    expect(split.remainder.isSplit).toBe(true);
  });

  it('gives both the buyer and seller the total volume', () => {
    const handler = new MockTransactionFeeHandler();
    const sale = {
      protocolFee: 1,
      protocolFeeWei: parseEther('1'),
      price: 2,
      ethPrice: 2000
    } as any as RewardSaleEvent;
    const phaseConfig = getMockPhaseConfig({ supply: 100, supplyUsed: 0, rewardRateNumerator: 1 });
    const phase = new TradingFeeRefundBasedPhase(phaseConfig);
    const tradingRewards = phase.details.tradingFeeRefund;
    if (!tradingRewards) {
      throw new Error('Invalid rewards program');
    }

    const reward = handler.getSaleReward(sale, tradingRewards);

    const { buyer, seller } = handler.getBuyerAndSellerEvents(
      sale,
      phase,
      reward.buyer,
      reward.seller,
      phase.details.tradingFeeRefund as TradingFeeRefundDto
    );

    expect(buyer.volumeEth).toBeCloseTo(sale.price);
    expect(seller.volumeEth).toBeCloseTo(sale.price);

    expect(buyer.reward).toBe(reward.buyer.reward);
    expect(seller.reward).toBe(reward.seller.reward);
  });

  it('updates the phase when the rewards are distributed', () => {
    const handler = new MockTransactionFeeHandler();
    const sale = {
      protocolFee: 1,
      protocolFeeWei: parseEther('1'),
      price: 2,
      ethPrice: 2000
    } as any as RewardSaleEvent;
    const phaseConfig = getMockPhaseConfig({ supply: 2000, supplyUsed: 0, rewardRateNumerator: 1 });
    const phase = new TradingFeeRefundBasedPhase(phaseConfig);
    const tradingRewardsBefore = JSON.parse(JSON.stringify(phase.details.tradingFeeRefund)) as TradingFeeRefundDto;
    if (!tradingRewardsBefore) {
      throw new Error('Invalid rewards program');
    }

    const rewards = handler.getSaleReward(sale, tradingRewardsBefore);
    const result = handler.onSale(sale, phase);

    const tradingRewardsAfter = result.phase.details.tradingFeeRefund;

    if (!tradingRewardsAfter || typeof tradingRewardsAfter === 'boolean') {
      throw new Error('Invalid rewards program');
    }

    expect(result.split).toBeUndefined();
    expect(tradingRewardsAfter.rewardSupplyUsed).toBe(tradingRewardsBefore.rewardSupplyUsed + rewards.total);
    expect(result.applicable).toBe(true);
  });

  it('splits rewards if the rewards are greater than the supply available', () => {
    const handler = new MockTransactionFeeHandler();
    const sale = {
      protocolFee: 1,
      protocolFeeWei: parseEther('1'),
      price: 2,
      ethPrice: 2000
    } as any as RewardSaleEvent;
    const phaseConfig = getMockPhaseConfig({ supply: 1999, supplyUsed: 0, rewardRateNumerator: 1 });
    const phase = new TradingFeeRefundBasedPhase(phaseConfig);
    const tradingRewardsBefore = JSON.parse(JSON.stringify(phase.details.tradingFeeRefund)) as TradingFeeRefundDto;
    if (!tradingRewardsBefore) {
      throw new Error('Invalid rewards program');
    }

    const result = handler.onSale(sale, phase);

    const tradingRewardsAfter = result.phase.details.tradingFeeRefund;

    if (!tradingRewardsAfter || typeof tradingRewardsAfter === 'boolean') {
      throw new Error('Invalid rewards program');
    }

    expect(result.split).toBeDefined();
    expect(tradingRewardsAfter.rewardSupplyUsed).toBe(tradingRewardsBefore.rewardSupplyUsed);
    expect(result.applicable).toBe(true);
  });
});
