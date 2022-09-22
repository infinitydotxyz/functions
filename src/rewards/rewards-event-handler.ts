import { ChainId, RewardEvent } from '@infinityxyz/lib/types/core';
import { FeesGeneratedDto, TokenomicsConfigDto, TradingFeeProgram } from '@infinityxyz/lib/types/dto/rewards';
import { firestoreConstants, formatEth } from '@infinityxyz/lib/utils';
import { DEFAULT_PHASES } from '../tokenomics/constants';
import { Phase } from './phases/phase.abstract';
import { PhaseFactory } from './phases/phase.factory';
import { CurationHandler } from './trading-fee-program-handlers/curation-handler';
import { TransactionFeeHandler } from './trading-fee-program-handlers/transaction-fee-handler';
import { TradingFeeProgramEventHandler } from './types';

export class RewardsEventHandler {
  protected _programEventHandler: Record<TradingFeeProgram, TradingFeeProgramEventHandler>;

  constructor(protected _db: FirebaseFirestore.Firestore) {
    this._programEventHandler = {
      [TradingFeeProgram.CollectionPot]: {} as any, // TODO
      [TradingFeeProgram.Raffle]: {} as any, // TODO
      [TradingFeeProgram.Treasury]: {} as any, // TODO
      [TradingFeeProgram.Curators]: new CurationHandler(),
      [TradingFeeProgram.TokenRefund]: new TransactionFeeHandler()
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
      const currentPhaseIndex = currentState?.phases.findIndex((item) => item.isActive);
      const currentPhase = currentState?.phases?.[currentPhaseIndex];
      const nextPhase = currentState?.phases?.[currentPhaseIndex + 1] ?? null;

      if (currentPhase?.isActive) {
        this._applyEvent(event, currentPhase, nextPhase, txn, db);
      }
    }
    await this._saveRewardProgramState(currentState, txn);
  }

  protected _applyEvent(
    event: RewardEvent,
    phase: Phase,
    nextPhase: Phase | null,
    txn?: FirebaseFirestore.Transaction,
    db?: FirebaseFirestore.Firestore
  ): { phase: Phase; nextPhase: Phase | null } {
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
    
    phase.lastBlockIncluded = Math.max(phase.lastBlockIncluded, event.blockNumber); 
    const currentFees = phase.details.feesGenerated;
    const feesGeneratedWei = (BigInt(currentFees.feesGeneratedWei) + BigInt(event.protocolFeeWei)).toString();
    const feesGeneratedEth = formatEth(feesGeneratedWei);
    const newFees: FeesGeneratedDto = {
      feesGeneratedWei: feesGeneratedWei,
      feesGeneratedEth: feesGeneratedEth,
      feesGeneratedUSDC: feesGeneratedEth * event.ethPrice
    }
    phase.details.feesGenerated = newFees;

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

    const program = doc.data() ?? this._defaultRewardsProgramState(chainId);

    return {
      chainId: program.chainId,
      phases: program.phases.map((item) => PhaseFactory.create(item))
    };
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
