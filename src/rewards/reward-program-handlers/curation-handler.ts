import {
  ChainId,
  CurationLedgerEvent,
  CurationLedgerSale,
  RewardEvent,
  RewardProgram,
  RewardSaleEvent
} from '@infinityxyz/lib/types/core';
import { firestoreConstants, getTokenAddressByStakerAddress } from '@infinityxyz/lib/utils';
import { getRelevantStakerContracts } from '../../functions/aggregate-sales-stats/utils';
import { RewardPhase } from '../reward-phase';
import { RewardProgramEventHandlerResponse, RewardProgramHandler } from './reward-program-handler.abstract';

export class CurationHandler extends RewardProgramHandler {
  protected _isApplicable(event: RewardEvent, phase: RewardPhase): boolean {
    if (phase.getRewardProgram(RewardProgram.Curation) !== true) {
      return false;
    }

    return true;
  }

  onSale(sale: RewardSaleEvent, phase: RewardPhase): RewardProgramEventHandlerResponse {
    if (!phase.isActive) {
      throw new Error('Phase is not active');
    }

    const isApplicable = this._isApplicable(sale, phase);
    if (!isApplicable) {
      return this._nonApplicableResponse(phase);
    }

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
    const stakerContracts = getRelevantStakerContracts(sale);
    const curationSales = stakerContracts.map((stakerContract) => {
      const { tokenContractAddress, tokenContractChainId } = getTokenAddressByStakerAddress(
        sale.chainId as ChainId,
        stakerContract
      );
      const curationSale: CurationLedgerSale = {
        ...sale,
        docId: '',
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
