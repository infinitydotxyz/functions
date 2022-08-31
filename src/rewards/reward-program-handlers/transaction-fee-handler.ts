import {
  ChainId,
  RewardProgram,
  RewardSaleEvent,
  TradingReward,
  TransactionFeeReward
} from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { parseEther } from 'ethers/lib/utils';
import { RewardPhase } from '../reward-phase';
import { RewardProgramEventHandlerResponse, RewardProgramHandler } from './reward-program-handler.abstract';

export class TransactionFeeHandler extends RewardProgramHandler {
  protected _getSaleReward(
    sale: RewardSaleEvent,
    tradingReward: TradingReward
  ): { total: number; buyerReward: number; sellerReward: number } {
    const protocolFeeUSDC = sale.protocolFee * sale.ethPrice;
    const reward = (protocolFeeUSDC * tradingReward.rewardRateNumerator) / tradingReward.rewardRateDenominator;
    const buyerReward = reward * tradingReward.buyerPortion;
    const sellerReward = reward * tradingReward.sellerPortion;
    return {
      total: reward,
      buyerReward,
      sellerReward
    };
  }

  protected _onSale(sale: RewardSaleEvent, phase: RewardPhase): RewardProgramEventHandlerResponse {
    const config = phase.getRewardProgram(RewardProgram.TradingFee);
    if (typeof config === 'boolean' || !config) {
      throw new Error('Invalid config');
    }

    if (!phase.isActive) {
      throw new Error('Phase is not active');
    }

    const { total: reward, buyerReward, sellerReward } = this._getSaleReward(sale, config);

    const phaseSupplyRemaining = config.rewardSupply - config.rewardSupplyUsed;

    if (reward <= phaseSupplyRemaining) {
      const { buyer, seller } = this._getBuyerAndSellerEvents(sale, phase, buyerReward, sellerReward);
      config.rewardSupplyUsed += reward;
      return {
        applicable: true,
        phase,
        saveEvent: (txn, db) => {
          const buyerRef = db.collection(firestoreConstants.USERS_COLL).doc(buyer.userAddress);
          const sellerRef = db.collection(firestoreConstants.USERS_COLL).doc(seller.userAddress);
          const buyerTransactionFeeRewards = buyerRef
            .collection('userRewards')
            .doc(sale.chainId)
            .collection('userTransactionFeeRewardsLedger');
          const sellerTransactionFeeRewards = sellerRef
            .collection('userRewards')
            .doc(sale.chainId)
            .collection('userTransactionFeeRewardsLedger');
          txn.create(buyerTransactionFeeRewards.doc(), buyer);
          txn.create(sellerTransactionFeeRewards.doc(), seller);
        },
        split: undefined
      };
    }

    const split = this._splitSale(sale, reward, phaseSupplyRemaining);

    return {
      applicable: true,
      phase,
      saveEvent: () => {
        return;
      },
      split
    };
  }

  protected _splitSale(
    sale: RewardSaleEvent,
    reward: number,
    phaseSupplyRemaining: number
  ): {
    current: RewardSaleEvent;
    remainder: RewardSaleEvent;
  } {
    const split = phaseSupplyRemaining / reward;
    const currentProtocolFee = sale.protocolFee * split;
    const currentProtocolFeeWei = parseEther(Math.floor(currentProtocolFee).toString()).toString();
    const remainingProtocolFee = sale.protocolFee - currentProtocolFee;
    const remainingProtocolFeeWei = parseEther(Math.floor(remainingProtocolFee).toString()).toString();

    return {
      current: {
        ...sale,
        price: sale.price * split,
        protocolFee: currentProtocolFee,
        protocolFeeWei: currentProtocolFeeWei,
        isSplit: true
      },
      remainder: {
        ...sale,
        price: sale.price * (1 - split),
        protocolFee: remainingProtocolFee,
        protocolFeeWei: remainingProtocolFeeWei,
        isSplit: true
      }
    };
  }

  protected _getBuyerAndSellerEvents(
    sale: RewardSaleEvent,
    phase: RewardPhase,
    buyerReward: number,
    sellerReward: number
  ): { buyer: TransactionFeeReward; seller: TransactionFeeReward } {
    const base = {
      sale,
      chainId: sale.chainId as ChainId,
      isSplit: sale.isSplit ?? false,
      phase: phase.toJSON(),
      isAggregated: false,
      /**
       * buyer and seller both receive the full volume of the sale
       */
      volumeWei: parseEther(sale.price.toString()).toString(),
      volumeEth: sale.price,
      updatedAt: Date.now()
    };

    const buyer = {
      ...base,
      userAddress: sale.buyer,
      reward: buyerReward
    };

    const seller = {
      ...base,
      userAddress: sale.seller,
      reward: sellerReward
    };

    return {
      buyer,
      seller
    };
  }
}
