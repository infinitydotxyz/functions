import { ChainId, RaffleState, RaffleType, RewardEvent, UserRaffle } from '@infinityxyz/lib/types/core';
import {
  FeesGeneratedDto,
  TokenomicsConfigDto,
  TokenomicsPhaseDto,
  TradingFeeProgram
} from '@infinityxyz/lib/types/dto/rewards';
import { firestoreConstants, formatEth, getRelevantStakerContracts } from '@infinityxyz/lib/utils';
import { DEFAULT_PHASES } from './config';

import { Phase } from './phases/phase.abstract';
import { PhaseFactory } from './phases/phase.factory';
import { CollectionPotHandler } from './trading-fee-program-handlers/collection-pot-handler';
import { CurationHandler } from './trading-fee-program-handlers/curation-handler';
import { RaffleHandler } from './trading-fee-program-handlers/raffle-handler';
import { TransactionFeeHandler } from './trading-fee-program-handlers/transaction-fee-handler';
import { TreasuryHandler } from './trading-fee-program-handlers/treasury-handler';
import { TradingFeeProgramEventHandler } from './types';

export class RewardsEventHandler {
  protected _programEventHandler: Record<TradingFeeProgram, TradingFeeProgramEventHandler>;

  constructor(protected _db: FirebaseFirestore.Firestore) {
    this._programEventHandler = {
      [TradingFeeProgram.CollectionPot]: new CollectionPotHandler(),
      [TradingFeeProgram.Raffle]: new RaffleHandler(),
      [TradingFeeProgram.Treasury]: new TreasuryHandler(),
      [TradingFeeProgram.Curators]: new CurationHandler(),
      [TradingFeeProgram.TokenRefund]: new TransactionFeeHandler()
    };
  }

  public async onPhaseStart(chainId: ChainId, phase: Phase, txn: FirebaseFirestore.Transaction) {
    const stakerContracts = getRelevantStakerContracts(chainId);
    const raffles: { data: UserRaffle; ref: FirebaseFirestore.DocumentReference<UserRaffle> }[] = [];
    for (const stakerContractAddress of stakerContracts) {
      const rafflesRef = this._db
        .collection(firestoreConstants.RAFFLES_COLL)
        .doc(`${chainId}:${stakerContractAddress}`)
        .collection(firestoreConstants.STAKING_CONTRACT_RAFFLES_COLL);
      const query = rafflesRef.where(
        'activePhaseIds',
        'array-contains',
        phase.details.id
      ) as FirebaseFirestore.Query<UserRaffle>;
      const raffleSnap = await txn.get(query);
      const phaseRaffles = raffleSnap.docs.map((item) => ({ data: item.data(), ref: item.ref }));
      raffles.push(...phaseRaffles);
    }

    const save = () => {
      for (const raffle of raffles) {
        if (raffle.data.state === RaffleState.Unstarted) {
          txn.set(raffle.ref, { state: RaffleState.InProgress }, { merge: true });
        }
      }
    };
    return save;
  }

  public async onPhaseComplete(chainId: ChainId, phase: Phase, txn: FirebaseFirestore.Transaction) {
    const stakerContracts = getRelevantStakerContracts(chainId);
    const raffles: { data: UserRaffle; ref: FirebaseFirestore.DocumentReference<UserRaffle> }[] = [];
    for (const stakerContractAddress of stakerContracts) {
      const rafflesRef = this._db
        .collection(firestoreConstants.RAFFLES_COLL)
        .doc(`${chainId}:${stakerContractAddress}`)
        .collection(firestoreConstants.STAKING_CONTRACT_RAFFLES_COLL);
      const query = rafflesRef.where(
        'activePhaseIds',
        'array-contains',
        phase.details.id
      ) as FirebaseFirestore.Query<UserRaffle>;
      const raffleSnap = await txn.get(query);
      const phaseRaffles = raffleSnap.docs.map((item) => ({ data: item.data(), ref: item.ref }));
      raffles.push(...phaseRaffles);
    }

    const save = () => {
      for (const raffle of raffles) {
        if (raffle.data.state === RaffleState.InProgress) {
          txn.set(raffle.ref, { state: RaffleState.Locked }, { merge: true });
        }
      }
    };
    return save;
  }

  public async onEvents(
    chainId: ChainId,
    events: RewardEvent[],
    txn?: FirebaseFirestore.Transaction,
    db?: FirebaseFirestore.Firestore
  ): Promise<void> {
    const currentState = await this._getRewardProgramState(chainId, txn);
    for (const event of events) {
      const currentPhaseIndex = currentState?.phases.findIndex((item) => item.isActive);
      const currentPhase = currentState?.phases?.[currentPhaseIndex];
      const nextPhase = currentState?.phases?.[currentPhaseIndex + 1] ?? null;

      if (currentPhase?.isActive) {
        await this._applyEvent(event, currentPhase, nextPhase, txn, db);
      }
    }
    await this._saveRewardProgramState(currentState, txn);
  }

  protected async _applyEvent(
    event: RewardEvent,
    phase: Phase,
    nextPhase: Phase | null,
    txn?: FirebaseFirestore.Transaction,
    db?: FirebaseFirestore.Firestore
  ): Promise<{ phase: Phase; nextPhase: Phase | null }> {
    let saves: ((txn: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore) => void)[] = [];

    const save = () => {
      if (txn && db) {
        for (const s of saves) {
          s(txn, db);
        }
      }
    };

    for (const handler of Object.values(this._programEventHandler)) {
      const { applicable, phase: updatedPhase, saveEvent, split } = handler.onEvent(event, phase);

      /**
       * the event should be split into two events across two different phases
       */
      if (split) {
        const { current, remainder } = split;
        saves = [];
        const currentPhaseResult = await this._applyEvent(current, phase, nextPhase, txn);
        console.assert(currentPhaseResult.phase.isActive === false, 'current phase should be inactive');
        console.assert(
          !currentPhaseResult.nextPhase || currentPhaseResult.nextPhase.isActive === true,
          'next phase should be active'
        );
        if (currentPhaseResult && nextPhase) {
          const { phase: currentPhase } = currentPhaseResult;
          const remainderResult = await this._applyEvent(remainder, nextPhase, null, txn);
          return { phase: currentPhase, nextPhase: remainderResult?.phase };
        }
        return currentPhaseResult;
      } else if (applicable && txn) {
        saves.push(saveEvent);
        phase = updatedPhase;

        if (phase.isActive === false) {
          const saveOnComplete = await this.onPhaseComplete(event.chainId, phase, txn);
          saves.push(saveOnComplete);
          if (nextPhase) {
            const saveOnPhaseStart = await this.onPhaseStart(event.chainId, nextPhase, txn);
            saves.push(saveOnPhaseStart);
          }
        }
      }
    }

    phase.lastBlockIncluded = Math.max(phase.lastBlockIncluded, event.blockNumber);

    if ('protocolFeeWei' in event) {
      const currentFees = phase.details.feesGenerated;
      const feesGeneratedWei = (BigInt(currentFees.feesGeneratedWei) + BigInt(event.protocolFeeWei)).toString();
      const feesGeneratedEth = formatEth(feesGeneratedWei);
      const newFees: FeesGeneratedDto = {
        feesGeneratedWei: feesGeneratedWei,
        feesGeneratedEth: feesGeneratedEth,
        feesGeneratedUSDC: feesGeneratedEth * event.ethPrice
      };
      phase.details.feesGenerated = newFees;
    }

    save();
    return { phase, nextPhase };
  }

  protected async _getRewardProgramState(
    chainId: ChainId,
    txn?: FirebaseFirestore.Transaction
  ): Promise<{ chainId: ChainId; phases: Phase[] }> {
    const ref = this._db
      .collection(firestoreConstants.REWARDS_COLL)
      .doc(chainId) as FirebaseFirestore.DocumentReference<TokenomicsConfigDto>;

    const doc = await (txn ? txn.get(ref) : ref.get());

    let program = doc.data();
    if (!program) {
      program = this._initProgram(chainId, txn);
    }

    return {
      chainId: program.chainId,
      phases: program.phases.map((item) => PhaseFactory.create(item))
    };
  }

  protected _initProgram(chainId: ChainId, txn?: FirebaseFirestore.Transaction): TokenomicsConfigDto {
    const defaultProgram = this._defaultRewardsProgramState(chainId);

    const raffles: Map<string, UserRaffle> = new Map();
    const updateRaffle = (
      stakerContractAddress: string,
      chainId: ChainId,
      phase: TokenomicsPhaseDto,
      isGrandPrize: boolean
    ) => {
      const id = isGrandPrize ? 'grandPrize' : phase.id;
      const raffleId = `${stakerContractAddress}-${chainId}-${id}`;
      let raffle = raffles.get(raffleId);
      if (raffle) {
        if (!raffle.activePhaseIds.includes(phase.id)) {
          raffle.activePhaseIds.push(phase.id);
          raffle.activePhases.push({
            id: phase.id,
            name: phase.name,
            index: phase.index
          });
          if (phase.index === 0) {
            raffle.state = RaffleState.InProgress;
          }
        }

        return raffle;
      }
      const name = isGrandPrize ? 'Grand Prize Raffle' : `${phase.name} Raffle`;
      const config = isGrandPrize
        ? phase.raffleConfig?.grandPrize.ticketConfig
        : phase.raffleConfig?.phasePrize.ticketConfig;
      if (!config) {
        throw new Error('Raffle config not found');
      }
      raffle = {
        name,
        config,
        stakerContractAddress,
        stakerContractChainId: chainId,
        type: RaffleType.User,
        updatedAt: Date.now(),
        chainId,
        state: phase.index === 0 ? RaffleState.InProgress : RaffleState.Unstarted,
        raffleContractAddress: '', // TODO
        raffleContractChainId: chainId,
        id,
        activePhaseIds: [phase.id],
        activePhases: [
          {
            id: phase.id,
            name: phase.name,
            index: phase.index
          }
        ]
      };

      raffles.set(raffleId, raffle);
      return raffle;
    };

    const stakerContracts = getRelevantStakerContracts(chainId);
    for (const phase of defaultProgram.phases) {
      for (const stakerContractAddress of stakerContracts) {
        if (phase.raffleConfig?.grandPrize) {
          updateRaffle(stakerContractAddress, chainId, phase, true);
        }
        if (phase.raffleConfig?.phasePrize) {
          updateRaffle(stakerContractAddress, chainId, phase, false);
        }
      }
    }

    for (const raffle of [...raffles.values()]) {
      const ref = this._db
        .collection(firestoreConstants.RAFFLES_COLL)
        .doc(`${raffle.stakerContractChainId}:${raffle.stakerContractAddress}`)
        .collection(firestoreConstants.STAKING_CONTRACT_RAFFLES_COLL)
        .doc(raffle.id);
      if (txn) {
        txn.set(ref, raffle);
      }
    }

    return defaultProgram;
  }

  protected _defaultRewardsProgramState(chainId: ChainId): TokenomicsConfigDto {
    return {
      chainId,
      phases: DEFAULT_PHASES
    };
  }

  protected async _saveRewardProgramState(
    state: { chainId: ChainId; phases: Phase[] },
    txn?: FirebaseFirestore.Transaction
  ) {
    const config: TokenomicsConfigDto = {
      chainId: state.chainId,
      phases: state.phases.map((item) => item.toJSON())
    };
    const ref = this._db
      .collection(firestoreConstants.REWARDS_COLL)
      .doc(state.chainId) as FirebaseFirestore.DocumentReference<TokenomicsConfigDto>;
    if (txn) {
      txn.set(ref, config);
    } else {
      await ref.set(config);
    }
  }
}
