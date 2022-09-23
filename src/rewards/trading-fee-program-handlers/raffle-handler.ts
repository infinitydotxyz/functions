import { ChainId, RewardEvent, RewardSaleEvent } from '@infinityxyz/lib/types/core';
import { TradingFeeDestination, TradingFeeProgram } from '@infinityxyz/lib/types/dto';
import { formatEth, getTokenAddressByStakerAddress } from '@infinityxyz/lib/utils';
import { getRelevantStakerContracts } from '../../functions/aggregate-sales-stats/utils';
import { Phase, ProgressAuthority } from '../phases/phase.abstract';
import { TradingFeeEventHandlerResponse } from '../types';
import { TradingFeeDestinationEventHandler } from './trading-fee-destination-event-handler.abstract';

export enum RaffleLedgerEventKind {
  NftSaleFeeContribution = 'NFT_SALE_FEE_CONTRIBUTION'
}

export enum RaffleType {
  User = 'USER',
  Collection = 'COLLECTION'
}

export interface RaffleLedgerSale {
  type: RaffleType;
  discriminator: RaffleLedgerEventKind.NftSaleFeeContribution;
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
    if (this.getFeePercentage(phase) > 0) {
      return true;
    }
    return false;
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

    const fees = phase.details.raffleFeesGenerated;
    const { eventFees } = this.updateFeesGenerated(fees, sale, phase);
    const phasePrizePercent = phase.details.raffleConfig?.phasePrize?.percentage ?? 0;
    const grandPrizePercent = phase.details.raffleConfig?.grandPrize?.percentage ?? 0;

    const phasePrizeContribution = (
      (BigInt(eventFees.feesGeneratedWei) * BigInt(phasePrizePercent)) /
      BigInt(100)
    ).toString();
    const grandPrizeContribution = (
      (BigInt(eventFees.feesGeneratedWei) * BigInt(grandPrizePercent)) /
      BigInt(100)
    ).toString();

    return {
      applicable: true,
      phase,
      saveEvent: (txn, db) => {
        const sales = this._transformSaleToRaffleLedgerSale(sale, phase);
        for (const sale of sales) {
          const rafflesRef = db
            .collection('raffles')
            .doc(`${sale.stakerContractChainId}:${sale.stakerContractAddress}`)
            .collection('stakingContractRaffles');
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

          // TODO should we update the entrant rewards ledger? how do we want to calculate user volume for the ticket calculation?
          const phaseRaffleLedgerEventRef = phaseRaffleRef.collection('raffleRewardsLedger').doc();
          const grandPrizeRaffleLedgerEventRef = grandPrizeRaffleRef.collection('raffleRewardsLedger').doc();
          txn.set(phaseRaffleLedgerEventRef, phaseRaffleLedgerSale);
          txn.set(grandPrizeRaffleLedgerEventRef, grandPrizeRaffleLedgerSale);
        }
      },
      split: undefined
    };
  }

  protected _transformSaleToRaffleLedgerSale(sale: RewardSaleEvent, phase: Phase) {
    const stakerContracts = getRelevantStakerContracts(sale.chainId as ChainId);
    const raffleLedgerSales = stakerContracts.map((stakerContract) => {
      const { tokenContractAddress, tokenContractChainId } = getTokenAddressByStakerAddress(
        sale.chainId as ChainId,
        stakerContract
      );
      const raffleLedgerSale: Omit<RaffleLedgerSale, 'contributionWei' | 'contributionEth'> = {
        type: RaffleType.User,
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
        timestamp: sale.timestamp,
        blockNumber: sale.blockNumber,
        isAggregated: false,
        discriminator: RaffleLedgerEventKind.NftSaleFeeContribution
      };
      return raffleLedgerSale;
    });

    return raffleLedgerSales;
  }
}
