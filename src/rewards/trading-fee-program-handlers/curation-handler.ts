import {
  ChainId,
  CurationLedgerEvent,
  CurationLedgerSale,
  RewardEvent,
  RewardSaleEvent
} from '@infinityxyz/lib/types/core';
import { TradingFeeDestination, TradingFeeProgram } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, getTokenAddressByStakerAddress } from '@infinityxyz/lib/utils';
import { getRelevantStakerContracts } from '../../functions/aggregate-sales-stats/utils';
import { Phase, ProgressAuthority } from '../phases/phase.abstract';
import { TradingFeeEventHandlerResponse } from '../types';
import { TradingFeeDestinationEventHandler } from './trading-fee-destination-event-handler.abstract';

export class CurationHandler extends TradingFeeDestinationEventHandler {
  constructor() {
    super(TradingFeeProgram.Curators, TradingFeeDestination.Curators);
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
    } else if (phase.authority === ProgressAuthority.Curation) {
      throw new Error(
        'Sale splitting must be implemented for curation handler before a curation authority can be used'
      );
    }

    const isApplicable = this._isApplicable(sale, phase);
    if (!isApplicable) {
      return this._nonApplicableResponse(phase);
    }

    const currentFees = phase.details.curationFeesGenerated;
    this.updateFeesGenerated(currentFees, sale, phase);
    return {
      applicable: true,
      phase,
      saveEvent: (txn, db) => {
        const sales = this._getCurationLedgerSale(sale);

        for (const curationSale of sales) {
          const collectionDocRef = db
            .collection(firestoreConstants.COLLECTIONS_COLL)
            .doc(`${curationSale.collectionChainId}:${curationSale.collectionAddress}`);
          const stakerContractDocRef = collectionDocRef
            .collection(firestoreConstants.COLLECTION_CURATION_COLL)
            .doc(`${curationSale.stakerContractChainId}:${curationSale.stakerContractAddress}`);
          const saleRef = stakerContractDocRef.collection(firestoreConstants.CURATION_LEDGER_COLL).doc();
          txn.set(saleRef, curationSale, { merge: false });
        }
      },
      split: undefined
    };
  }

  protected _getCurationLedgerSale(sale: RewardSaleEvent): CurationLedgerSale[] {
    const stakerContracts = getRelevantStakerContracts(sale.chainId as ChainId);
    const curationSales = stakerContracts.map((stakerContract) => {
      const { tokenContractAddress, tokenContractChainId } = getTokenAddressByStakerAddress(
        sale.chainId as ChainId,
        stakerContract
      );
      const curationSale: CurationLedgerSale = {
        ...sale,
        docId: sale.docId,
        updatedAt: Date.now(),
        discriminator: CurationLedgerEvent.Sale,
        chainId: sale.chainId as ChainId,
        collectionAddress: sale.collectionAddress,
        collectionChainId: sale.chainId as ChainId,
        stakerContractAddress: stakerContract,
        stakerContractChainId: sale.chainId as ChainId,
        isStakeMerged: true,
        tokenContractAddress,
        tokenContractChainId,
        isAggregated: false
      };
      return curationSale;
    });

    return curationSales;
  }
}
