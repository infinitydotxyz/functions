import { parseEther } from 'ethers/lib/utils';

import { ChainId, RewardEventVariant, RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { TokenomicsConfigDto, TradingFeeRefundDto } from '@infinityxyz/lib/types/dto/rewards';

import { DEFAULT_RAFFLE_CONFIG, TRADING_FEE_SPLIT_PHASE_1_TO_4, getDefaultFeesGenerated } from './config';
import { REWARD_BUFFER } from './constants';
import { Phase } from './phases/phase.abstract';
import { PhaseFactory } from './phases/phase.factory';
import { RewardsEventHandler } from './rewards-event-handler';

class MockRewardsEventHandler extends RewardsEventHandler {
  public state: TokenomicsConfigDto;

  constructor(state: TokenomicsConfigDto) {
    super({} as any);
    this.state = state;
  }

  protected _getRewardProgramState(chainId: ChainId) {
    if (!this.state) {
      this.state = this._defaultRewardsProgramState(chainId);
    }
    return Promise.resolve({
      chainId: this.state.chainId,
      phases: this.state.phases.map((item) => PhaseFactory.create(item))
    });
  }

  protected async _saveRewardProgramState(state: { chainId: ChainId; phases: Phase[] }) {
    this.state = {
      chainId: state.chainId,
      phases: state.phases.map((item) => item.toJSON())
    };
    return Promise.resolve();
  }
}

describe('RewardsEventHandler', () => {
  it('should split rewards between multiple phases', async () => {
    const phases = [
      {
        name: 'Phase 1',
        id: '1',
        index: 0,
        isActive: true,
        split: TRADING_FEE_SPLIT_PHASE_1_TO_4,
        lastBlockIncluded: 0,
        progress: 0,
        feesGenerated: getDefaultFeesGenerated(),
        curationFeesGenerated: getDefaultFeesGenerated(),
        raffleFeesGenerated: getDefaultFeesGenerated(),
        collectionPotFeesGenerated: getDefaultFeesGenerated(),
        treasuryFeesGenerated: getDefaultFeesGenerated(),
        tradingFeeRefund: {
          maxReward: Number.POSITIVE_INFINITY,
          rewardRateNumerator: 10,
          rewardRateDenominator: 1,
          rewardSupply: 45,
          rewardSupplyUsed: 0,
          buyerPortion: 0.7,
          sellerPortion: 0.3
        },
        raffleConfig: {
          phasePrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG },
          grandPrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG }
        }
      },
      {
        name: 'Phase 2',
        id: '2',
        index: 1,
        isActive: false,
        split: TRADING_FEE_SPLIT_PHASE_1_TO_4,
        lastBlockIncluded: 0,
        progress: 0,
        feesGenerated: getDefaultFeesGenerated(),
        curationFeesGenerated: getDefaultFeesGenerated(),
        raffleFeesGenerated: getDefaultFeesGenerated(),
        collectionPotFeesGenerated: getDefaultFeesGenerated(),
        treasuryFeesGenerated: getDefaultFeesGenerated(),
        tradingFeeRefund: {
          maxReward: Number.POSITIVE_INFINITY,
          rewardRateNumerator: 10,
          rewardRateDenominator: 1,
          rewardSupply: 10,
          rewardSupplyUsed: 0,
          buyerPortion: 0.7,
          sellerPortion: 0.3
        },
        raffleConfig: {
          phasePrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG },
          grandPrize: { percentage: 50, ticketConfig: DEFAULT_RAFFLE_CONFIG }
        }
      }
    ];
    const handler = new MockRewardsEventHandler({
      chainId: ChainId.Mainnet,
      phases: phases
    });

    const phaseOneTradingFeeRefund = phases[0].tradingFeeRefund;
    if (!phaseOneTradingFeeRefund) {
      throw new Error('Phase one trading fee refund is not defined');
    }
    const sale: RewardSaleEvent = {
      ethPrice: 1,
      docId: 'asdf',
      updatedAt: Date.now(),
      chainId: ChainId.Mainnet,
      price: 1,
      protocolFee: 1,
      protocolFeeWei: parseEther('1').toString(),
      txHash: '0x0',
      buyer: '0x0',
      seller: '0x0',
      discriminator: RewardEventVariant.Sale
    } as any;

    const expectedRewardsPerSale = 10;
    let totalSupplyUsed = 0;

    for (const s of Array(5).fill(sale)) {
      await handler.onEvents(ChainId.Mainnet, [s]);
      totalSupplyUsed += expectedRewardsPerSale;

      const tradingRewards = handler.state.phases[0].tradingFeeRefund as any as TradingFeeRefundDto;

      if (totalSupplyUsed > tradingRewards.rewardSupply - REWARD_BUFFER) {
        expect(tradingRewards.rewardSupplyUsed).toBeGreaterThanOrEqual(tradingRewards.rewardSupply - REWARD_BUFFER);
        expect(handler.state.phases[1].isActive).toBe(true);
        expect(handler.state.phases[0].isActive).toBe(false);
      } else {
        expect(tradingRewards.rewardSupplyUsed).toBe(totalSupplyUsed);
        expect(handler.state.phases[0].isActive).toBe(true);
        expect(handler.state.phases[1].isActive).toBe(true);
      }
    }

    expect(handler.state.phases[0].isActive).toBe(false);
    expect(handler.state.phases[1].isActive).toBe(true);
  });
});
