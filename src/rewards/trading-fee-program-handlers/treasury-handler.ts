import {
  ChainId,
  PreMergeReferralSaleEvent,
  ReferralSaleEvent,
  RewardEvent,
  RewardListingEvent,
  RewardSaleEvent
} from '@infinityxyz/lib/types/core';
import { TradingFeeDestination, TradingFeeProgram } from '@infinityxyz/lib/types/dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { getDefaultFeesGenerated } from '../config';
import { Phase, ProgressAuthority } from '../phases/phase.abstract';
import { TradingFeeEventHandlerResponse } from '../types';
import { TradingFeeDestinationEventHandler } from './trading-fee-destination-event-handler.abstract';

export enum TreasuryEventVariant {
  BalanceIncrease = 'BALANCE_INCREASE',
  BalanceDecrease = 'BALANCE_DECREASE'
}

export enum TreasuryIncomeSource {
  NftSale = 'NFT_SALE'
}
export interface TreasuryBalanceAddedEvent {
  chainId: ChainId;
  discriminator: TreasuryEventVariant.BalanceIncrease;
  timestamp: number;
  isAggregated: boolean;
  contributionWei: string;
  contributionEth: number;
  phaseName: string;
  phaseId: string;
  phaseIndex: number;
  source: TreasuryIncomeSource;
  sale: RewardSaleEvent;
  updatedAt: number;
  blockNumber: number;
}

export class TreasuryHandler extends TradingFeeDestinationEventHandler {
  constructor() {
    super(TradingFeeProgram.Treasury, TradingFeeDestination.Treasury);
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
    } else if (phase.authority === ProgressAuthority.Treasury) {
      throw new Error(
        'Sale splitting must be implemented for treasury handler before a treasury authority can be used'
      );
    }

    const isApplicable = this._isApplicable(sale, phase);
    if (!isApplicable) {
      return this._nonApplicableResponse(phase);
    }

    const fees = phase.details.treasuryFeesGenerated;
    const referralFees = phase.details.referralFeesGenerated ?? getDefaultFeesGenerated();
    const { eventDestinationFees, eventReferralFees } = this.updateFeesGenerated(fees, sale, phase, referralFees);

    return {
      applicable: true,
      phase,
      saveEvent: (txn, db) => {
        if ('referral' in sale && sale.referral) {
          const { referralPercent } = this.getFeePercentage(phase, true);
          const referralRef = db
            .collection(firestoreConstants.USERS_COLL)
            .doc(sale.referral.referrer)
            .collection(firestoreConstants.REFERRALS_COLL)
            .doc(sale.chainId)
            .collection(firestoreConstants.REFERRALS_LEDGER)
            .doc() as FirebaseFirestore.DocumentReference<ReferralSaleEvent>;
          const referralEvent: PreMergeReferralSaleEvent = {
            sale: {
              chainId: sale.chainId,
              txHash: sale.txHash,
              blockNumber: sale.blockNumber,
              timestamp: sale.timestamp,
              collectionAddress: sale.collectionAddress,
              tokenId: sale.tokenId,
              price: sale.price,
              paymentToken: sale.paymentToken,
              buyer: sale.buyer,
              seller: sale.seller,
              quantity: sale.quantity,
              tokenStandard: sale.tokenStandard,
              source: sale.source,
              protocolFee: sale.protocolFee,
              protocolFeeBPS: sale.protocolFeeBPS,
              protocolFeeWei: sale.protocolFeeWei
            },
            referral: sale.referral,
            ethPrice: sale.ethPrice,
            docId: sale.docId,
            updatedAt: Date.now(),
            isAggregated: false,
            isDeleted: false,
            isDisplayDataMerged: false,
            referralFeesGenerated: eventReferralFees,
            referralRewardPercent: referralPercent
          };
          txn.create(referralRef, referralEvent);
        }

        const ref = db
          .collection(firestoreConstants.TREASURY_COLL)
          .doc(sale.chainId)
          .collection(firestoreConstants.TREASURY_LEDGER_COLL)
          .doc();
        const treasuryEventDoc: TreasuryBalanceAddedEvent = {
          phaseId: phase.details.id,
          phaseIndex: phase.details.index,
          phaseName: phase.details.name,
          chainId: sale.chainId,
          discriminator: TreasuryEventVariant.BalanceIncrease,
          contributionWei: eventDestinationFees.feesGeneratedWei,
          contributionEth: eventDestinationFees.feesGeneratedEth,
          source: TreasuryIncomeSource.NftSale,
          sale,
          blockNumber: sale.blockNumber,
          updatedAt: Date.now(),
          timestamp: sale.timestamp,
          isAggregated: false
        };

        txn.create(ref, treasuryEventDoc);
      },
      split: undefined
    };
  }
}
