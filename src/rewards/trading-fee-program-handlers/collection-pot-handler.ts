import { ChainId, RewardEvent, RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { TradingFeeDestination, TradingFeeProgram } from '@infinityxyz/lib/types/dto';
import { getTokenAddressByStakerAddress } from '@infinityxyz/lib/utils';
import { getRelevantStakerContracts } from '../../functions/aggregate-sales-stats/utils';
import { Phase, ProgressAuthority } from '../phases/phase.abstract';
import { TradingFeeEventHandlerResponse } from '../types';
import { RaffleLedgerEventKind, RaffleLedgerSale, RaffleType } from './raffle-handler';
import { TradingFeeDestinationEventHandler } from './trading-fee-destination-event-handler.abstract';

export class CollectionPotHandler extends TradingFeeDestinationEventHandler {
  constructor() {
    super(TradingFeeProgram.CollectionPot, TradingFeeDestination.CollectionPot);
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
    const { eventFees } = this.updateFeesGenerated(fees, sale, phase);
    return {
      applicable: true,
      phase,
      saveEvent: (txn, db) => {
        const sales = this._transformSaleToCollectionPotSale(sale, phase);
        for (const sale of sales) {
          const rafflesRef = db
            .collection('raffle')
            .doc(`${sale.stakerContractChainId}:${sale.stakerContractAddress}`)
            .collection('raffles');
          const collectionRaffleRef = rafflesRef.doc(`collection:${phase.details.id}`);

          const collectionPrizeRaffleLedgerSale: RaffleLedgerSale = {
            ...sale,
            contributionWei: eventFees.feesGeneratedWei,
            contributionEth: eventFees.feesGeneratedEth
          };

          const collectionRaffleLedgerEventRef = collectionRaffleRef.collection('raffleTotalsLedger').doc();
          txn.set(collectionRaffleLedgerEventRef, collectionPrizeRaffleLedgerSale);
        }
      },
      split: undefined
    };
  }

  protected _transformSaleToCollectionPotSale(sale: RewardSaleEvent, phase: Phase) {
    const stakerContracts = getRelevantStakerContracts(sale.chainId as ChainId);
    const raffleLedgerSales = stakerContracts.map((stakerContract) => {
      const { tokenContractAddress, tokenContractChainId } = getTokenAddressByStakerAddress(
        sale.chainId as ChainId,
        stakerContract
      );
      const raffleLedgerSale: Omit<RaffleLedgerSale, 'contributionWei' | 'contributionEth'> = {
        type: RaffleType.Collection,
        sale,
        phaseName: phase.details.name,
        phaseId: phase.details.id,
        phaseIndex: phase.details.index,
        updatedAt: Date.now(),
        chainId: sale.chainId as ChainId,
        buyerAddress: sale.buyer,
        sellerAddress: sale.seller,
        collectionAddress: sale.collectionAddress,
        stakerContractAddress: stakerContract,
        stakerContractChainId: sale.chainId as ChainId,
        tokenContractAddress,
        tokenContractChainId,
        blockNumber: sale.blockNumber,
        isAggregated: false,
        discriminator: RaffleLedgerEventKind.NftSaleFeeContribution
      };
      return raffleLedgerSale;
    });
    return raffleLedgerSales;
  }
}
