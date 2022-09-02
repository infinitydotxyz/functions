import { ChainId, Epoch, Phase, RewardProgram, RewardSaleEvent, RewardType } from '@infinityxyz/lib/types/core';
import { RewardsProgramDto, TradingRewardDto } from '@infinityxyz/lib/types/dto/rewards';
import { parseEther } from 'ethers/lib/utils';
import { REWARD_BUFFER } from './constants';
import { RewardEpoch } from './reward-epoch';
import { RewardsEventHandler } from './rewards-event-handler';

class MockRewardsEventHandler extends RewardsEventHandler {
  public state: RewardsProgramDto;

  constructor(state: RewardsProgramDto) {
    super({} as any);
    this.state = state;
  }

  protected _getRewardProgramState(chainId: ChainId) {
    if (!this.state) {
      this.state = this._defaultRewardsProgramState(chainId);
    }
    return Promise.resolve({
      chainId: this.state.chainId,
      epochs: this.state.epochs.map((item) => new RewardEpoch(item))
    });
  }

  protected async _saveRewardProgramState(state: { chainId: ChainId; epochs: RewardEpoch[] }) {
    this.state = {
      chainId: state.chainId,
      epochs: state.epochs.map((item) => item.toJSON())
    };
    return Promise.resolve();
  }
}

describe('RewardsEventHandler', () => {
  it('should split rewards between multiple phases', async () => {
    const handler = new MockRewardsEventHandler({
      chainId: ChainId.Mainnet,
      epochs: [
        {
          name: Epoch.One,
          isActive: false,
          startsAt: 0,
          phases: [
            {
              name: Phase.One,
              epoch: Epoch.One,
              isActive: false,
              [RewardProgram.TradingFee]: {
                maxReward: Number.POSITIVE_INFINITY,
                rewardRateNumerator: 10,
                rewardRateDenominator: 1,
                rewardType: RewardType.ERC20,
                rewardSupply: 35,
                rewardSupplyUsed: 0,
                buyerPortion: 0.3,
                sellerPortion: 0.7
              },
              [RewardProgram.NftReward]: null,
              [RewardProgram.Curation]: false
            },
            {
              name: Phase.Two,
              epoch: Epoch.One,
              isActive: false,
              [RewardProgram.TradingFee]: null,
              [RewardProgram.NftReward]: null,
              [RewardProgram.Curation]: true
            }
          ]
        }
      ]
    });
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
      seller: '0x0'
    } as any;

    const expectedRewardsPerSale = 10;
    let totalSupplyUsed = 0;

    for (const s of Array(5).fill(sale)) {
      await handler.onEvents(ChainId.Mainnet, [s]);
      totalSupplyUsed += expectedRewardsPerSale;

      const tradingRewards = handler.state.epochs[0].phases[0][RewardProgram.TradingFee] as any as TradingRewardDto;

      if (totalSupplyUsed > tradingRewards.rewardSupply - REWARD_BUFFER) {
        expect(tradingRewards.rewardSupplyUsed).toBeGreaterThanOrEqual(tradingRewards.rewardSupply - REWARD_BUFFER);
        expect(handler.state.epochs[0].phases[1].isActive).toBe(true);
        expect(handler.state.epochs[0].phases[0].isActive).toBe(false);
      } else {
        expect(tradingRewards.rewardSupplyUsed).toBe(totalSupplyUsed);
        expect(handler.state.epochs[0].phases[0].isActive).toBe(true);
        expect(handler.state.epochs[0].phases[1].isActive).toBe(true);
      }
    }

    expect(handler.state.epochs[0].phases[0].isActive).toBe(false);
    expect(handler.state.epochs[0].phases[1].isActive).toBe(true);
  });

  it('should split rewards between multiple epochs', async () => {
    const handler = new MockRewardsEventHandler({
      chainId: ChainId.Mainnet,
      epochs: [
        {
          name: Epoch.One,
          isActive: false,
          startsAt: 0,
          phases: [
            {
              name: Phase.One,
              epoch: Epoch.One,
              isActive: false,
              [RewardProgram.TradingFee]: {
                maxReward: Number.POSITIVE_INFINITY,
                rewardRateNumerator: 10,
                rewardRateDenominator: 1,
                rewardType: RewardType.ERC20,
                rewardSupply: 35,
                rewardSupplyUsed: 0,
                buyerPortion: 0.3,
                sellerPortion: 0.7
              },
              [RewardProgram.NftReward]: null,
              [RewardProgram.Curation]: false
            }
          ]
        },
        {
          name: Epoch.Two,
          isActive: false,
          startsAt: 0,
          phases: [
            {
              name: Phase.Two,
              epoch: Epoch.Two,
              isActive: false,
              [RewardProgram.TradingFee]: null,
              [RewardProgram.NftReward]: null,
              [RewardProgram.Curation]: true
            }
          ]
        }
      ]
    });
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
      seller: '0x0'
    } as any;

    const expectedRewardsPerSale = 10;
    let totalSupplyUsed = 0;
    for (const s of Array(5).fill(sale)) {
      await handler.onEvents(ChainId.Mainnet, [s]);
      totalSupplyUsed += expectedRewardsPerSale;

      const tradingRewards = handler.state.epochs[0].phases[0][RewardProgram.TradingFee] as any as TradingRewardDto;

      if (totalSupplyUsed > tradingRewards.rewardSupply - REWARD_BUFFER) {
        expect(tradingRewards.rewardSupplyUsed).toBeGreaterThanOrEqual(tradingRewards.rewardSupply - REWARD_BUFFER);
        expect(handler.state.epochs[1].phases[0].isActive).toBe(true);
        expect(handler.state.epochs[0].phases[0].isActive).toBe(false);
      } else {
        expect(tradingRewards.rewardSupplyUsed).toBe(totalSupplyUsed);
        expect(handler.state.epochs[0].phases[0].isActive).toBe(true);
        expect(handler.state.epochs[1].phases[0].isActive).toBe(true);
      }
    }

    expect(handler.state.epochs[0].phases[0].isActive).toBe(false);
    expect(handler.state.epochs[1].phases[0].isActive).toBe(true);
  });
});
