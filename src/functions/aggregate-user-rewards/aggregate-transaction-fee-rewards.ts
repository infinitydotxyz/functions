import {
  AllTimeTransactionFeeRewardsDoc,
  ChainId,
  TransactionFeePhaseRewardsDoc,
  TransactionFeeRewardDoc
} from '@infinityxyz/lib/types/core';
import { calculateStatsBigInt, firestoreConstants } from '@infinityxyz/lib/utils';
import { paginatedTransaction } from '../../firestore/paginated-transaction';
import { calculateStats } from '../aggregate-sales-stats/utils';

const getDefaultUserAllTimeRewardsDoc = (chainId: ChainId, userAddress: string): AllTimeTransactionFeeRewardsDoc => {
  const doc: AllTimeTransactionFeeRewardsDoc = {
    chainId,
    userAddress,
    rewards: 0,
    volumeEth: 0,
    volumeUSDC: 0,
    volumeWei: '0',
    updatedAt: Date.now(),
    userSells: 0,
    userBuys: 0,
    protocolFeesWei: '0',
    protocolFeesEth: 0,
    protocolFeesUSDC: 0
  };
  return doc;
};

export async function aggregateTransactionFeeRewards(
  ledgerRef: FirebaseFirestore.CollectionReference<TransactionFeeRewardDoc>,
  chainId: ChainId,
  userAddress: string
) {
  const query = ledgerRef.where('isAggregated', '==', false).orderBy('updatedAt', 'asc');

  const userTransactionFeeRewardsRef = ledgerRef.parent;
  if (!userTransactionFeeRewardsRef) {
    console.error('userTransactionFeeRewardsRef is null');
    return;
  }

  await paginatedTransaction(
    query,
    ledgerRef.firestore,
    { pageSize: 100, maxPages: 10 },
    async ({ data: unaggregatedSalesSnap, txn }) => {
      const allTimeDocRef = userTransactionFeeRewardsRef
        .collection(firestoreConstants.USER_ALL_TIME_REWARDS_COLL)
        .doc(
          firestoreConstants.USER_ALL_TIME_TXN_FEE_REWARDS_DOC
        ) as FirebaseFirestore.DocumentReference<AllTimeTransactionFeeRewardsDoc>;
      const allTimeDoc = await txn.get(allTimeDocRef);

      const allTimeRewards = allTimeDoc.data() ?? getDefaultUserAllTimeRewardsDoc(chainId, userAddress);
      const phaseRefsMap = new Map<
        string,
        {
          ref: FirebaseFirestore.DocumentReference<TransactionFeePhaseRewardsDoc>;
          rewards: TransactionFeeRewardDoc[];
          phaseName: string;
          phaseId: string;
          phaseIndex: number;
        }
      >();

      for (const doc of unaggregatedSalesSnap.docs) {
        const event = doc.data();
        if (!event) {
          continue;
        }

        const phase = phaseRefsMap.get(event.phaseId) ?? {
          phaseId: event.phaseId,
          phaseName: event.phaseName,
          phaseIndex: event.phaseIndex,
          ref: userTransactionFeeRewardsRef
            .collection(firestoreConstants.USER_REWARD_PHASES_COLL)
            .doc(event.phaseId) as FirebaseFirestore.DocumentReference<TransactionFeePhaseRewardsDoc>,
          rewards: [] as TransactionFeeRewardDoc[]
        };

        phase.rewards.push(event);
        phaseRefsMap.set(event.phaseId, phase);
      }

      const phases: {
        phaseId: string;
        phaseName: string;
        phaseIndex: number;
        ref: FirebaseFirestore.DocumentReference<TransactionFeePhaseRewardsDoc>;
        rewards: TransactionFeeRewardDoc[];
        data?: TransactionFeePhaseRewardsDoc;
      }[] = [...phaseRefsMap.entries()].map(([, { ref, rewards, phaseId, phaseName, phaseIndex }]) => ({
        phaseId,
        phaseName,
        phaseIndex,
        ref,
        rewards
      }));

      const phaseDocs = phases.length > 0 ? await txn.getAll(...phases.map((item) => item.ref)) : [];
      const phasesWithData: {
        phaseId: string;
        phaseName: string;
        phaseIndex: number;
        ref: FirebaseFirestore.DocumentReference<TransactionFeePhaseRewardsDoc>;
        rewards: TransactionFeeRewardDoc[];
        data: TransactionFeePhaseRewardsDoc;
      }[] = phaseDocs.map((doc, index) => {
        const phase = doc.data();
        const item = phases[index];

        const defaultPhase: TransactionFeePhaseRewardsDoc = {
          phaseName: item.phaseName,
          phaseId: item.phaseId,
          phaseIndex: item.phaseIndex,
          userAddress,
          chainId,
          rewards: 0,
          volumeEth: 0,
          volumeWei: '0',
          volumeUSDC: 0,
          updatedAt: Date.now(),
          userSells: 0,
          userBuys: 0,
          protocolFeesWei: '0',
          protocolFeesEth: 0,
          protocolFeesUSDC: 0,
          config: item.rewards?.[0]?.config,
          isCopiedToRaffles: false
        };

        return {
          ...item,
          data: phase ?? defaultPhase
        };
      });

      for (const { ref, rewards: rewardEvents, data } of phasesWithData) {
        const rewardsToAdd = calculateStats(rewardEvents, (item) => item.reward).sum;
        const volumeToAdd = calculateStats(rewardEvents, (item) => item.volumeEth).sum;
        const volumeWeiToAdd = calculateStatsBigInt(rewardEvents, (item) => BigInt(item.volumeWei)).sum;
        const volumeUSDCToAdd = calculateStats(rewardEvents, (item) => item.volumeUSDC).sum;
        const protocolFeeWeiToAdd = calculateStatsBigInt(rewardEvents, (item) => BigInt(item.protocolFeesWei)).sum;
        const protocolFeeEthToAdd = calculateStats(rewardEvents, (item) => item.protocolFeesEth).sum;
        const protocolFeeUSDCToAdd = calculateStats(rewardEvents, (item) => item.protocolFeesUSDC).sum;

        const { sells: sellsToAdd, buys: buysToAdd } = countBuysAndSells(rewardEvents);

        const rewards = (data?.rewards ?? 0) + rewardsToAdd;
        const volumeEth = (data?.volumeEth ?? 0) + volumeToAdd;
        const volumeWei = (BigInt(data?.volumeWei ?? '0') + BigInt(volumeWeiToAdd)).toString();
        const volumeUSDC = (data?.volumeUSDC ?? 0) + volumeUSDCToAdd;
        const protocolFeesWei = (BigInt(data?.protocolFeesWei ?? '0') + BigInt(protocolFeeWeiToAdd)).toString();
        const protocolFeesEth = (data?.protocolFeesEth ?? 0) + protocolFeeEthToAdd;
        const protocolFeesUSDC = (data?.protocolFeesUSDC ?? 0) + protocolFeeUSDCToAdd;
        const userSells = (data?.userSells ?? 0) + sellsToAdd;
        const userBuys = (data?.userBuys ?? 0) + buysToAdd;

        allTimeRewards.rewards += rewardsToAdd;
        allTimeRewards.volumeEth += volumeToAdd;
        allTimeRewards.userSells += sellsToAdd;
        allTimeRewards.userBuys += buysToAdd;
        allTimeRewards.volumeWei = (BigInt(allTimeRewards.volumeWei) + BigInt(volumeWeiToAdd)).toString();
        allTimeRewards.volumeUSDC += volumeUSDCToAdd;
        allTimeRewards.protocolFeesEth += protocolFeeEthToAdd;
        allTimeRewards.protocolFeesWei = (
          BigInt(allTimeRewards.protocolFeesWei) + BigInt(protocolFeeWeiToAdd)
        ).toString();
        allTimeRewards.protocolFeesUSDC += protocolFeeUSDCToAdd;

        const update: TransactionFeePhaseRewardsDoc = {
          ...data,
          userAddress,
          rewards,
          volumeEth,
          volumeUSDC,
          volumeWei,
          protocolFeesEth,
          protocolFeesWei,
          protocolFeesUSDC,
          userSells,
          userBuys,
          updatedAt: Date.now(),
          isCopiedToRaffles: false
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
    }
  );
}

function countBuysAndSells(events: TransactionFeeRewardDoc[]) {
  const { sells, buys } = events.reduce(
    (acc, event) => {
      const isSeller = event.userAddress === event.sale.seller;
      if (isSeller) {
        return {
          sells: acc.sells + 1,
          buys: acc.buys
        };
      }
      return {
        sells: acc.sells,
        buys: acc.buys + 1
      };
    },
    { sells: 0, buys: 0 }
  );

  return { sells, buys };
}
