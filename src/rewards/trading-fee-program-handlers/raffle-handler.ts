import { ChainId, RaffleType, RewardEvent, RewardListingEvent, RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { TradingFeeDestination, TradingFeeProgram } from '@infinityxyz/lib/types/dto';
import {
  firestoreConstants,
  formatEth,
  getRelevantStakerContracts,
  getTokenAddressByStakerAddress
} from '@infinityxyz/lib/utils';
import { getDefaultFeesGenerated } from '../config';
import { Phase, ProgressAuthority } from '../phases/phase.abstract';
import { TradingFeeEventHandlerResponse } from '../types';
import { TradingFeeDestinationEventHandler } from './trading-fee-destination-event-handler.abstract';

// TODO move types to lib
export enum RaffleLedgerEventVariant {
  NftSaleFeeContribution = 'NFT_SALE_FEE_CONTRIBUTION'
}
export interface RaffleLedgerSale {
  type: RaffleType;
  discriminator: RaffleLedgerEventVariant.NftSaleFeeContribution;
  sale: RewardSaleEvent;
  timestamp: number;
  updatedAt: number;
  chainId: ChainId;
  blockNumber: number;
  isAggregated: boolean;
  phaseName: string;
  phaseId: string;
  phaseIndex: number;
  buyerAddress: string;
  sellerAddress: string;
  collectionAddress: string;
  stakerContractAddress: string;
  stakerContractChainId: ChainId;
  tokenContractAddress: string;
  tokenContractChainId: ChainId;
  contributionWei: string;
  contributionEth: number;
}

export class RaffleHandler extends TradingFeeDestinationEventHandler {
  constructor() {
    super(TradingFeeProgram.Raffle, TradingFeeDestination.Raffle);
  }

  protected _isApplicable(event: RewardEvent, phase: Phase): boolean {
    if (this.getFeePercentage(phase, false).totalPercent > 0) {
      return true;
    }
    return false;
  }

  protected _onListing(listing: RewardListingEvent, phase: Phase): TradingFeeEventHandlerResponse {
    return this._nonApplicableResponse(phase);
  }

  protected _onSale(sale: RewardSaleEvent, phase: Phase): TradingFeeEventHandlerResponse {
    if (!phase.isActive) {
      throw new Error('Phase is not active');
    } else if (phase.authority === ProgressAuthority.Raffle) {
      throw new Error('Sale splitting must be implemented for raffle handler before a raffle authority can be used');
    }

    const isApplicable = this._isApplicable(sale, phase);
    if (!isApplicable) {
      return this._nonApplicableResponse(phase);
    }

    const currentFees = phase.details.raffleFeesGenerated;
    const referralFees = phase.details.referralFeesGenerated ?? getDefaultFeesGenerated();
    const { eventDestinationFees, eventReferralFees } = this.updateFeesGenerated(
      currentFees,
      sale,
      phase,
      referralFees
    );
    if (BigInt(eventReferralFees.feesGeneratedWei) > BigInt(0)) {
      throw new Error('Not yet implemented. Implement referral fee handling for raffle');
    }

    const phasePrizePercent = phase.details.raffleConfig?.phasePrize?.percentage ?? 0;
    const grandPrizePercent = phase.details.raffleConfig?.grandPrize?.percentage ?? 0;

    const phasePrizeContribution = (
      (BigInt(eventDestinationFees.feesGeneratedWei) * BigInt(phasePrizePercent)) /
      BigInt(100)
    ).toString();
    const grandPrizeContribution = (
      (BigInt(eventDestinationFees.feesGeneratedWei) * BigInt(grandPrizePercent)) /
      BigInt(100)
    ).toString();

    return {
      applicable: true,
      phase,
      saveEvent: (txn, db) => {
        const sales = this._transformSaleToRaffleLedgerSale(sale, phase);
        for (const sale of sales) {
          const rafflesRef = db
            .collection(firestoreConstants.RAFFLES_COLL)
            .doc(`${sale.stakerContractChainId}:${sale.stakerContractAddress}`)
            .collection(firestoreConstants.STAKING_CONTRACT_RAFFLES_COLL);
          const phaseRaffleRef = rafflesRef.doc(phase.details.id);
          const grandPrizeRaffleRef = rafflesRef.doc('grandPrize');

          const phaseRaffleLedgerSale: RaffleLedgerSale = {
            ...sale,
            contributionWei: phasePrizeContribution.toString(),
            contributionEth: formatEth(phasePrizeContribution.toString())
          };

          const grandPrizeRaffleLedgerSale: RaffleLedgerSale = {
            ...sale,
            contributionWei: grandPrizeContribution.toString(),
            contributionEth: formatEth(grandPrizeContribution.toString())
          };

          const phaseRaffleLedgerEventRef = phaseRaffleRef
            .collection(firestoreConstants.RAFFLE_REWARDS_LEDGER_COLL)
            .doc();
          const grandPrizeRaffleLedgerEventRef = grandPrizeRaffleRef
            .collection(firestoreConstants.RAFFLE_REWARDS_LEDGER_COLL)
            .doc();
          txn.set(phaseRaffleLedgerEventRef, phaseRaffleLedgerSale);
          txn.set(grandPrizeRaffleLedgerEventRef, grandPrizeRaffleLedgerSale);
        }
      },
      split: undefined
    };
  }

  protected _transformSaleToRaffleLedgerSale(sale: RewardSaleEvent, phase: Phase) {
    const stakerContracts = getRelevantStakerContracts(sale.chainId);
    const raffleLedgerSales = stakerContracts.map((stakerContract) => {
      const { tokenContractAddress, tokenContractChainId } = getTokenAddressByStakerAddress(
        sale.chainId,
        stakerContract
      );
      const raffleLedgerSale: Omit<RaffleLedgerSale, 'contributionWei' | 'contributionEth'> = {
        type: RaffleType.User,
        sale,
        phaseName: phase.details.name,
        phaseId: phase.details.id,
        phaseIndex: phase.details.index,
        updatedAt: Date.now(),
        chainId: sale.chainId,
        buyerAddress: sale.buyer,
        sellerAddress: sale.seller,
        collectionAddress: sale.collectionAddress,
        stakerContractAddress: stakerContract,
        stakerContractChainId: sale.chainId,
        tokenContractAddress,
        tokenContractChainId,
        timestamp: sale.timestamp,
        blockNumber: sale.blockNumber,
        isAggregated: false,
        discriminator: RaffleLedgerEventVariant.NftSaleFeeContribution
      };
      return raffleLedgerSale;
    });

    return raffleLedgerSales;
  }
}
