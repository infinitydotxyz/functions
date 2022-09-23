import { ChainId, RewardEvent, RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { TradingFeeDestination, TradingFeeProgram } from '@infinityxyz/lib/types/dto';
import { Phase, ProgressAuthority } from '../phases/phase.abstract';
import { TradingFeeEventHandlerResponse } from '../types';
import { TradingFeeDestinationEventHandler } from './trading-fee-destination-event-handler.abstract';

export enum TreasuryEventVariant {
  BalanceIncrease = 'BALANCE_INCREASE',
  BalanceDecrease = 'BALANCE_DECREASE',
}

export enum TreasuryIncomeSource { 
  NftSale = 'NFT_SALE',
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
    if (this.getFeePercentage(phase) > 0) {
      return true;
    }

    return false;
  }

  protected _onSale(sale: RewardSaleEvent, phase: Phase): TradingFeeEventHandlerResponse {
    if (!phase.isActive) {
      throw new Error('Phase is not active');
    } else if (phase.authority === ProgressAuthority.Treasury) {
      throw new Error('Sale splitting must be implemented for treasury handler before a treasury authority can be used');
    }

    const isApplicable = this._isApplicable(sale, phase);
    if (!isApplicable) {
      return this._nonApplicableResponse(phase);
    }

    const fees = phase.details.treasuryFeesGenerated;
    const { eventFees } = this.updateFeesGenerated(fees, sale, phase);
    return {
      applicable: true,
      phase,
      saveEvent: (txn, db) => {
        const ref = db.collection('treasury').doc(sale.chainId).collection('treasuryLedger').doc();
        const treasuryEventDoc: TreasuryBalanceAddedEvent = {
          phaseId: phase.details.id,
          phaseIndex: phase.details.index,
          phaseName: phase.details.name,
          chainId: sale.chainId as ChainId,
          discriminator: TreasuryEventVariant.BalanceIncrease,
          contributionWei: eventFees.feesGeneratedWei,
          contributionEth: eventFees.feesGeneratedEth,
          source: TreasuryIncomeSource.NftSale,
          sale,
          blockNumber: sale.blockNumber,
          updatedAt: Date.now(),
          timestamp: sale.timestamp,
          isAggregated: false,
        };

        txn.create(ref, treasuryEventDoc);
      },
      split: undefined
    };
  }
}
