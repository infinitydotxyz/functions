import { ChainId, RewardEvent, RewardProgram } from '@infinityxyz/lib/types/core';
import { RewardsProgramDto } from '@infinityxyz/lib/types/dto/rewards';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { TradingFeeDestination, TradingFeeProgram } from '../tokenomics/types';
import { epochs } from './config';
import { RewardEpoch } from './reward-epoch';
import { RewardPhase } from './reward-phase';
import { CurationHandler } from './reward-program-handlers/curation-handler';
import { TransactionFeeHandler } from './reward-program-handlers/transaction-fee-handler';
import { TradingFeeDestinationEventHandler } from './types';



export class RewardsEventHandler {
  protected _programEventHandler: Record<TradingFeeProgram, TradingFeeDestinationEventHandler>;

  constructor(protected _db: FirebaseFirestore.Firestore) {
    this._programEventHandler = {
      // [RewardProgram.TradingFee]: new TransactionFeeHandler(),
      // [RewardProgram.Curation]: new CurationHandler()
      [TradingFeeDestination.Curators]: new CurationHandler(),
      [TradingFeeDestination.Raffle]: new TransactionFeeHandler()
    };
  }

  public async onEvents(
    chainId: ChainId,
    events: RewardEvent[],
    txn?: FirebaseFirestore.Transaction,
    db?: FirebaseFirestore.Firestore
  ): Promise<void> {
    const currentState = await this._getRewardProgramState(chainId, txn);
    for (const event of events) {
      const currentEpochIndex = currentState.epochs.findIndex((item) => item.isActive);
      const currentEpoch = currentState.epochs[currentEpochIndex];
      const currentPhaseIndex = currentEpoch?.phases.findIndex((item) => item.isActive);
      const currentPhase = currentEpoch?.phases?.[currentPhaseIndex];
      const nextPhaseIndexes = currentEpoch?.phases?.[currentPhaseIndex + 1]
        ? [currentEpochIndex, currentPhaseIndex + 1]
        : [currentEpochIndex + 1, 0];
      const nextPhase = currentState?.epochs?.[nextPhaseIndexes[0]]?.phases?.[nextPhaseIndexes[1]] ?? null;

      if (currentPhase?.isActive) {
        this._applyEvent(event, currentPhase, nextPhase, txn, db);
      }
    }
    await this._saveRewardProgramState(currentState, txn);
  }

  protected _applyEvent(
    event: RewardEvent,
    phase: RewardPhase,
    nextPhase: RewardPhase | null,
    txn?: FirebaseFirestore.Transaction,
    db?: FirebaseFirestore.Firestore
  ): { phase: RewardPhase; nextPhase: RewardPhase | null } {
    let saves: ((txn: FirebaseFirestore.Transaction, db: FirebaseFirestore.Firestore) => void)[] = [];

    const save = () => {
      if (txn && db) {
        for (const s of saves) {
          s(txn, db);
        }
      }
    };

    for (const value of Object.values(RewardProgram)) {
      const handler = this._programEventHandler[value];
      if (!handler) {
        console.error(`No handler for program ${value}`);
      } else {
        const { applicable, phase: updatedPhase, saveEvent, split } = handler.onEvent(event, phase);

        /**
         * the event should be split into two events across two different phases
         */
        if (split) {
          const { current, remainder } = split;
          saves = [];
          const currentPhaseResult = this._applyEvent(current, phase, nextPhase, txn);
          console.assert(currentPhaseResult.phase.isActive === false, 'current phase should be inactive');
          console.assert(
            !currentPhaseResult.nextPhase || currentPhaseResult.nextPhase.isActive === true,
            'next phase should be active'
          );
          if (currentPhaseResult && nextPhase) {
            const { phase: currentPhase } = currentPhaseResult;
            const remainderResult = this._applyEvent(remainder, nextPhase, null, txn);
            return { phase: currentPhase, nextPhase: remainderResult?.phase };
          }
          return currentPhaseResult;
        } else if (applicable && txn) {
          saves.push(saveEvent);
          phase = updatedPhase;
        }
      }
    }
    save();
    return { phase, nextPhase };
  }

  protected async _getRewardProgramState(
    chainId: ChainId,
    txn?: FirebaseFirestore.Transaction
  ): Promise<{ chainId: ChainId; epochs: RewardEpoch[] }> {
    const ref = this._db
      .collection(firestoreConstants.REWARDS_COLL)
      .doc(chainId) as FirebaseFirestore.DocumentReference<RewardsProgramDto>;

    const doc = await (txn ? txn.get(ref) : ref.get());

    const program = doc.data() ?? this._defaultRewardsProgramState(chainId);

    return {
      chainId: program.chainId,
      epochs: program.epochs.map((item) => new RewardEpoch(item))
    };
  }

  protected _defaultRewardsProgramState(chainId: ChainId): RewardsProgramDto {
    return {
      chainId,
      epochs: epochs
    };
  }

  protected async _saveRewardProgramState(
    state: { chainId: ChainId; epochs: RewardEpoch[] },
    txn?: FirebaseFirestore.Transaction
  ) {
    const program = {
      chainId: state.chainId,
      epochs: state.epochs.map((item) => item.toJSON())
    };
    const ref = this._db
      .collection(firestoreConstants.REWARDS_COLL)
      .doc(state.chainId) as FirebaseFirestore.DocumentReference<RewardsProgramDto>;
    if (txn) {
      txn.set(ref, program);
    } else {
      await ref.set(program);
    }
  }
}
