import {
  AllTimeTransactionFeeRewardsDoc,
  ChainId,
  Phase,
  RewardProgram,
  TransactionFeePhaseRewardsDoc,
  TransactionFeeRewardDoc
} from '@infinityxyz/lib/types/core';
import { calculateStatsBigInt, firestoreConstants } from '@infinityxyz/lib/utils';
import { getEpochByPhase } from '../../rewards/utils';
import { calculateStats } from '../aggregate-sales-stats/utils';

export async function aggregateTransactionFeeRewards(
  ledgerRef: FirebaseFirestore.CollectionReference<TransactionFeeRewardDoc>,
  chainId: ChainId,
  userAddress: string
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
      const newAllTimeRewardsDoc: AllTimeTransactionFeeRewardsDoc = {
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
      const allTimeRewards = allTimeDoc.data() ?? newAllTimeRewardsDoc;

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

        const defaultPhase: TransactionFeePhaseRewardsDoc = {
          epoch: epoch.name,
          chainId,
          phase: item.phase,
          tradingFeeRewards: getProgramRewards(RewardProgram.TradingFee),
          nftRewards: getProgramRewards(RewardProgram.NftReward),
          rewards: 0,
          volumeEth: 0,
          volumeUSDC: 0,
          volumeWei: '0',
          protocolFeesEth: 0,
          protocolFeesWei: '0',
          protocolFeesUSDC: 0,
          userAddress,
          updatedAt: Date.now(),
          userSells: 0,
          userBuys: 0
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

        const { sells: sellsToAdd, buys: buysToAdd } = rewardEvents.reduce(
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
