import { ChainId } from '@infinityxyz/lib/types/core';
import { epochs } from './config';
import { RewardProgram, RewardsProgram } from './epoch.type';
import { RewardPhase } from './reward-phase';
import { RawRewardEvent, RewardProgramEventHandler } from './types';

/**
 * takes raw events and applies them to the rewards program
 */
export class RewardsEventHandler {
  constructor(
    protected _rewardsProgram: RewardsProgram,
    protected _db: FirebaseFirestore.Firestore,
    protected _programEventHandler: Record<RewardProgram, RewardProgramEventHandler>
  ) {}

  public async onEvents(
    chainId: ChainId,
    events: RawRewardEvent[],
    txn?: FirebaseFirestore.Transaction
  ): Promise<void> {
    const currentState = await this._getRewardProgramState(chainId, txn);
    for (const event of events) {
      const currentEpochIndex = currentState.epochs.findIndex((item) => item.isActive);
      const currentEpoch = currentState.epochs[currentEpochIndex];
      const currentPhaseIndex = currentEpoch?.phases.findIndex((item) => item.isActive);
      const currentPhase = currentEpoch?.phases?.[currentPhaseIndex];
      const nextPhaseIndexes = currentEpoch?.phases?.[currentPhaseIndex + 1] ? [currentEpochIndex, currentPhaseIndex + 1] : [currentEpochIndex + 1, 0];
      const nextPhase = currentState?.epochs?.[nextPhaseIndexes[0]]?.phases?.[nextPhaseIndexes[1]] ?? null;
      // TODO add token price to sales

      if (currentPhase?.isActive) {
        const rewardPhase = new RewardPhase(currentPhase);
        const nextRewardPhase = new RewardPhase(nextPhase);
        const result = this._applyEvent(event, rewardPhase, nextRewardPhase, txn);
        const { phase } = result;
        currentState.epochs[currentEpochIndex].phases[currentPhaseIndex] = phase.toJSON();
        currentState.epochs[nextPhaseIndexes[0]].phases[nextPhaseIndexes[1]] = nextRewardPhase.toJSON();
      }
    }
    await this._saveRewardProgramState(chainId, currentState, txn);
  }

  protected _applyEvent(
    event: RawRewardEvent,
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
          console.assert(!currentPhaseResult.nextPhase || currentPhaseResult.nextPhase.isActive === true, 'next phase should be active');
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
  ): Promise<RewardsProgram> {
    const ref = this._db.collection('rewards').doc(chainId) as FirebaseFirestore.DocumentReference<RewardsProgram>;

    const doc = await (txn ? txn.get(ref) : ref.get());

    const program = doc.data() ?? this._defaultRewardsProgramState(chainId);

    return program;
  }

  protected _defaultRewardsProgramState(chainId: ChainId): RewardsProgram {
    return {
      chainId,
      epochs: epochs
    };
  }

  protected async _saveRewardProgramState(
    chainId: ChainId,
    state: RewardsProgram,
    txn?: FirebaseFirestore.Transaction
  ) {
    const ref = this._db.collection('rewards').doc(chainId) as FirebaseFirestore.DocumentReference<RewardsProgram>;
    if (txn) {
      txn.set(ref, state);
    } else {
      await ref.set(state);
    }
  }
}
