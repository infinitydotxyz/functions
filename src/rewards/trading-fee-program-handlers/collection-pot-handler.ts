import { RaffleType, RewardEvent, RewardListingEvent, RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { TradingFeeDestination, TradingFeeProgram } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, getRelevantStakerContracts, getTokenAddressByStakerAddress } from '@infinityxyz/lib/utils';
import { getDefaultFeesGenerated } from '../config';
import { Phase, ProgressAuthority } from '../phases/phase.abstract';
import { TradingFeeEventHandlerResponse } from '../types';
import { RaffleLedgerEventVariant, RaffleLedgerSale } from './raffle-handler';
import { TradingFeeDestinationEventHandler } from './trading-fee-destination-event-handler.abstract';

export class CollectionPotHandler extends TradingFeeDestinationEventHandler {
  constructor() {
    super(TradingFeeProgram.CollectionPot, TradingFeeDestination.CollectionPot);
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
    } else if (phase.authority === ProgressAuthority.CollectionPot) {
      throw new Error(
        'Sale splitting must be implemented for collection pot handler before a collection pot authority can be used'
      );
    }

    const isApplicable = this._isApplicable(sale, phase);
    if (!isApplicable) {
      return this._nonApplicableResponse(phase);
    }

    const fees = phase.details.collectionPotFeesGenerated;
    const referralFees = phase.details.referralFeesGenerated ?? getDefaultFeesGenerated();
    const { eventDestinationFees, eventReferralFees } = this.updateFeesGenerated(fees, sale, phase, referralFees);
    if (BigInt(eventReferralFees.feesGeneratedWei) > BigInt(0)) {
      throw new Error('Not yet implemented. Implement referral fee handling for collection pot');
    }
    return {
      applicable: true,
      phase,
      saveEvent: (txn, db) => {
        const sales = this._transformSaleToCollectionPotSale(sale, phase);
        for (const sale of sales) {
          const rafflesRef = db
            .collection(firestoreConstants.RAFFLES_COLL)
            .doc(`${sale.stakerContractChainId}:${sale.stakerContractAddress}`)
            .collection(firestoreConstants.STAKING_CONTRACT_RAFFLES_COLL);
          const collectionRaffleRef = rafflesRef.doc(`collection:${phase.details.id}`);

          const collectionPrizeRaffleLedgerSale: RaffleLedgerSale = {
            ...sale,
            contributionWei: eventDestinationFees.feesGeneratedWei,
            contributionEth: eventDestinationFees.feesGeneratedEth
          };

          const collectionRaffleLedgerEventRef = collectionRaffleRef
            .collection(firestoreConstants.RAFFLE_REWARDS_LEDGER_COLL)
            .doc();
          txn.set(collectionRaffleLedgerEventRef, collectionPrizeRaffleLedgerSale);
        }
      },
      split: undefined
    };
  }

  protected _transformSaleToCollectionPotSale(sale: RewardSaleEvent, phase: Phase) {
    const stakerContracts = getRelevantStakerContracts(sale.chainId);
    const raffleLedgerSales = stakerContracts.map((stakerContract) => {
      const { tokenContractAddress, tokenContractChainId } = getTokenAddressByStakerAddress(
        sale.chainId,
        stakerContract
      );
      const raffleLedgerSale: Omit<RaffleLedgerSale, 'contributionWei' | 'contributionEth'> = {
        type: RaffleType.Collection,
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
        blockNumber: sale.blockNumber,
        timestamp: sale.timestamp,
        isAggregated: false,
        discriminator: RaffleLedgerEventVariant.NftSaleFeeContribution
      };
      return raffleLedgerSale;
    });
    return raffleLedgerSales;
  }
}
