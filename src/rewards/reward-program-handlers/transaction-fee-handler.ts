import { ChainId, RewardProgram, RewardSaleEvent, TransactionFeeRewardDoc } from '@infinityxyz/lib/types/core';
import { TradingRewardDto } from '@infinityxyz/lib/types/dto/rewards';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { BigNumber } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { RewardPhase } from '../reward-phase';
import { RewardProgramEventHandlerResponse, RewardProgramHandler } from './reward-program-handler.abstract';

export class TransactionFeeHandler extends RewardProgramHandler {
  protected _getSaleReward(
    sale: RewardSaleEvent,
    tradingReward: TradingRewardDto
  ): {
    total: number;
    buyer: { reward: number; protocolFeesWei: string; protocolFeesEth: number; protocolFeesUSDC: number };
    seller: { reward: number; protocolFeesWei: string; protocolFeesEth: number; protocolFeesUSDC: number };
  } {
    const buyerProtocolFee = sale.protocolFee * tradingReward.buyerPortion;
    const sellerProtocolFee = sale.protocolFee * tradingReward.sellerPortion;

    const buyerProtocolFeeWei = BigNumber.from(sale.protocolFeeWei)
      .mul(tradingReward.buyerPortion * 100_000)
      .div(100_000)
      .toString();
    const sellerProtocolFeeWei = BigNumber.from(sale.protocolFeeWei)
      .mul(tradingReward.sellerPortion * 100_000)
      .div(100_000)
      .toString();

    const protocolFeeUSDC = sale.protocolFee * sale.ethPrice;
    const reward = (protocolFeeUSDC * tradingReward.rewardRateNumerator) / tradingReward.rewardRateDenominator;
    const buyerReward = reward * tradingReward.buyerPortion;
    const sellerReward = reward * tradingReward.sellerPortion;
    return {
      total: reward,
      buyer: {
        reward: buyerReward,
        protocolFeesWei: buyerProtocolFeeWei,
        protocolFeesEth: buyerProtocolFee,
        protocolFeesUSDC: buyerProtocolFee * sale.ethPrice
      },
      seller: {
        reward: sellerReward,
        protocolFeesWei: sellerProtocolFeeWei,
        protocolFeesEth: sellerProtocolFee,
        protocolFeesUSDC: sellerProtocolFee * sale.ethPrice
      }
    };
  }

  protected _onSale(sale: RewardSaleEvent, phase: RewardPhase): RewardProgramEventHandlerResponse {
    const config = phase.getRewardProgram(RewardProgram.TradingFee);
    if (!phase.isActive) {
      throw new Error('Phase is not active');
    }

    if (typeof config === 'boolean' || !config) {
      return this._nonApplicableResponse(phase);
    }

    const { total: reward, buyer: buyerReward, seller: sellerReward } = this._getSaleReward(sale, config);

    const phaseSupplyRemaining = config.rewardSupply - config.rewardSupplyUsed;

    if (reward <= phaseSupplyRemaining) {
      const { buyer, seller } = this._getBuyerAndSellerEvents(sale, phase, buyerReward, sellerReward);
      config.rewardSupplyUsed += reward;
      phase.maxBlockNumber = Math.max(phase.maxBlockNumber, sale.blockNumber);
      return {
        applicable: true,
        phase,
        saveEvent: (txn, db) => {
          const buyerRef = db.collection(firestoreConstants.USERS_COLL).doc(buyer.userAddress);
          const sellerRef = db.collection(firestoreConstants.USERS_COLL).doc(seller.userAddress);
          const buyerTransactionFeeRewards = buyerRef
            .collection(firestoreConstants.USER_REWARDS_COLL)
            .doc(sale.chainId)
            .collection(firestoreConstants.USER_TXN_FEE_REWARDS_LEDGER_COLL);
          const sellerTransactionFeeRewards = sellerRef
            .collection(firestoreConstants.USER_REWARDS_COLL)
            .doc(sale.chainId)
            .collection(firestoreConstants.USER_TXN_FEE_REWARDS_LEDGER_COLL);
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
    buyerReward: { reward: number; protocolFeesWei: string; protocolFeesEth: number; protocolFeesUSDC: number },
    sellerReward: { reward: number; protocolFeesWei: string; protocolFeesEth: number; protocolFeesUSDC: number }
  ): { buyer: TransactionFeeRewardDoc; seller: TransactionFeeRewardDoc } {
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
      volumeUSDC: sale.price * sale.ethPrice,
      updatedAt: Date.now()
    };

    const buyer: TransactionFeeRewardDoc = {
      ...base,
      userAddress: sale.buyer,
      reward: buyerReward.reward,
      protocolFeesWei: buyerReward.protocolFeesWei,
      protocolFeesEth: buyerReward.protocolFeesEth,
      protocolFeesUSDC: buyerReward.protocolFeesUSDC
    };

    const seller: TransactionFeeRewardDoc = {
      ...base,
      userAddress: sale.seller,
      reward: sellerReward.reward,
      protocolFeesWei: sellerReward.protocolFeesWei,
      protocolFeesEth: sellerReward.protocolFeesEth,
      protocolFeesUSDC: sellerReward.protocolFeesUSDC
    };

    return {
      buyer,
      seller
    };
  }
}
