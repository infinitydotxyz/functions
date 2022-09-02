import {
  AllTimeTransactionFeeRewardsDoc,
  ChainId,
  Phase,
  RewardProgram,
  TransactionFeePhaseRewardsDoc,
  TransactionFeeRewardDoc
} from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getEpochByPhase } from '../../rewards/utils';
import { calculateStats } from '../aggregate-sales-stats/utils';

export async function aggregateTransactionFeeRewards(
  ledgerRef: FirebaseFirestore.CollectionReference<TransactionFeeRewardDoc>,
  chainId: ChainId
) {
  const query = ledgerRef.where('isAggregated', '==', false).orderBy('updatedAt', 'asc');
  let numResults = (await query.limit(1).get()).size;

  while (numResults > 0) {
    await ledgerRef.firestore.runTransaction(async (txn) => {
      const userTransactionFeeRewardsRef = ledgerRef.parent;
      if (!userTransactionFeeRewardsRef) {
        console.error('userTransactionFeeRewardsRef is null');
        return;
      }
      const allTimeDocRef = userTransactionFeeRewardsRef
        .collection(firestoreConstants.USER_ALL_TIME_REWARDS_COLL)
        .doc(
          firestoreConstants.USER_ALL_TIME_TXN_FEE_REWARDS_DOC
        ) as FirebaseFirestore.DocumentReference<AllTimeTransactionFeeRewardsDoc>;
      const allTimeDoc = await txn.get(allTimeDocRef);
      const allTimeRewards = allTimeDoc.data() ?? {
        chainId,
        rewards: 0,
        volume: 0,
        updatedAt: Date.now()
      };

      const unaggregatedSalesSnap = await txn.get(query.limit(100));
      numResults = unaggregatedSalesSnap.size;

      const phaseRefsMap = new Map<
        Phase,
        { ref: FirebaseFirestore.DocumentReference<TransactionFeePhaseRewardsDoc>; rewards: TransactionFeeRewardDoc[] }
      >();

      for (const doc of unaggregatedSalesSnap.docs) {
        const event = doc.data();
        if (!event) {
          continue;
        }

        const phase = phaseRefsMap.get(event.phase.name) ?? {
          ref: userTransactionFeeRewardsRef
            .collection(firestoreConstants.USER_REWARD_PHASES_COLL)
            .doc(event.phase.name) as FirebaseFirestore.DocumentReference<TransactionFeePhaseRewardsDoc>,
          rewards: [] as TransactionFeeRewardDoc[]
        };

        phase.rewards.push(event);
        phaseRefsMap.set(event.phase.name, phase);
      }

      const phases: {
        phase: Phase;
        ref: FirebaseFirestore.DocumentReference<TransactionFeePhaseRewardsDoc>;
        rewards: TransactionFeeRewardDoc[];
        data?: TransactionFeePhaseRewardsDoc;
      }[] = [...phaseRefsMap.entries()].map(([phase, { ref, rewards }]) => ({ phase, ref, rewards }));

      const phaseDocs = phases.length > 0 ? await txn.getAll(...phases.map((item) => item.ref)) : [];
      const phasesWithData: {
        phase: Phase;
        ref: FirebaseFirestore.DocumentReference<TransactionFeePhaseRewardsDoc>;
        rewards: TransactionFeeRewardDoc[];
        data: TransactionFeePhaseRewardsDoc;
      }[] = phaseDocs.map((doc, index) => {
        const phase = doc.data() as TransactionFeePhaseRewardsDoc;
        const item = phases[index];
        const { epoch, phase: phaseConfig } = getEpochByPhase(item.phase);
        const getProgramRewards = (rewardProgram: RewardProgram) => {
          const program = phaseConfig[rewardProgram];
          if (program && program !== true) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { rewardSupplyUsed: _, ...rest } = program;
            return rest;
          }
          return null;
        };

        return {
          ...item,
          data: phase ?? {
            epoch: epoch.name,
            chainId,
            phase: item.phase,
            tradingFeeRewards: getProgramRewards(RewardProgram.TradingFee),
            nftRewards: getProgramRewards(RewardProgram.NftReward),
            rewards: 0,
            volume: 0
          }
        };
      });

      for (const { ref, rewards: rewardEvents, data } of phasesWithData) {
        const rewardsToAdd = calculateStats(rewardEvents, (item) => item.reward).sum;
        const volumeToAdd = calculateStats(rewardEvents, (item) => item.volumeEth).sum;
        const rewards = (data?.rewards ?? 0) + rewardsToAdd;
        const volume = (data?.volume ?? 0) + volumeToAdd;

        allTimeRewards.rewards += rewardsToAdd;
        allTimeRewards.volume += volumeToAdd;

        const update: TransactionFeePhaseRewardsDoc = {
          ...data,
          rewards,
          volume,
          updatedAt: Date.now()
        };
        txn.set(ref, update, { merge: true });
      }

      for (const doc of unaggregatedSalesSnap.docs) {
        const update: Partial<TransactionFeeRewardDoc> = {
          isAggregated: true
        };
        txn.set(doc.ref, update, { merge: true });
      }

      txn.set(allTimeDocRef, { ...allTimeRewards, updatedAt: Date.now() }, { merge: true });
    });
  }
}
