import { calculateStatsBigInt, formatEth } from '@infinityxyz/lib/utils';
import { paginatedTransaction } from '../../firestore/paginated-transaction';
import { RaffleLedgerSale } from '../../rewards/trading-fee-program-handlers/raffle-handler';
import { RaffleRewardsDoc, RaffleRewardsLedgerTriggerDoc } from './types';

export async function aggregateRaffleRewardsLedger(
  rewardsLedger: FirebaseFirestore.CollectionReference<RaffleLedgerSale>,
  rewardsLedgerTriggerRef: FirebaseFirestore.DocumentReference<RaffleRewardsLedgerTriggerDoc>
) {
  const unaggregatedRewards = rewardsLedger.where('isAggregated', '==', false);

  let updatedRequiresAggregation = false;
  const { queryEmpty } = await paginatedTransaction(
    unaggregatedRewards,
    rewardsLedger.firestore,
    { pageSize: 300, maxPages: 10 },
    async ({ data, txn, hasNextPage }) => {
      const raffleRewardsRef = rewardsLedger.parent
        ?.collection('raffleTotals')
        .doc('raffleRewards') as FirebaseFirestore.DocumentReference<RaffleRewardsDoc>;
      if (!raffleRewardsRef) {
        throw new Error('Invalid raffle rewards ledger ref');
      }
      const raffleRewardsSnap = await txn.get(raffleRewardsRef);
      let raffleRewards = raffleRewardsSnap.data();

      const contributions = data.docs.map((item) => item.data()).filter((item) => !item);
      const stats = calculateStatsBigInt(contributions, ({ contributionWei }) => BigInt(contributionWei));

      if (!raffleRewards) {
        const initRewards: RaffleRewardsDoc = {
          stakerContractAddress: contributions[0].stakerContractAddress,
          stakerContractChainId: contributions[0].stakerContractChainId,
          tokenContractAddress: contributions[0].tokenContractAddress,
          tokenContractChainId: contributions[0].tokenContractChainId,
          type: contributions[0].type,
          updatedAt: Date.now(),
          chainId: contributions[0].chainId,
          prizePoolWei: '0',
          prizePoolEth: 0
        };

        raffleRewards = initRewards;
      }

      raffleRewards.prizePoolWei = (BigInt(raffleRewards.prizePoolWei) + stats.sum).toString();
      raffleRewards.prizePoolEth = formatEth(raffleRewards.prizePoolWei);

      if (!hasNextPage) {
        txn.set(rewardsLedgerTriggerRef, { requiresAggregation: false, updatedAt: Date.now() }, { merge: true });
        updatedRequiresAggregation = true;
      }
      for (const { ref } of data.docs) {
        txn.set(ref, { isAggregated: true, updatedAt: Date.now() }, { merge: true });
      }
      txn.set(raffleRewardsRef, raffleRewards, { merge: true });
    }
  );

  if (!updatedRequiresAggregation && queryEmpty) {
    await rewardsLedgerTriggerRef.set({ requiresAggregation: false, updatedAt: Date.now() }, { merge: true });
  }
}
