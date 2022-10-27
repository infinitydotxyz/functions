import { EntrantOrderLedgerItem, PreMergeEntrantOrderLedgerItem } from '@infinityxyz/lib/types/core';
import { TokenomicsConfigDto, TokenomicsPhaseDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { getCachedUserStakeLevel } from '../../utils/get-cached-user-stake-level';
import { getApplicableRaffles } from './save-txn-fees';

export async function addOrdersToRaffleLedgers(
  item: PreMergeEntrantOrderLedgerItem,
  itemRef: FirebaseFirestore.DocumentReference<PreMergeEntrantOrderLedgerItem>,
  db: FirebaseFirestore.Firestore
) {
  const chainId = item.chainId;
  const tokenomicsDocRef = db
    .collection(firestoreConstants.REWARDS_COLL)
    .doc(chainId) as FirebaseFirestore.DocumentReference<TokenomicsConfigDto>;
  const tokenomicsDocSnap = await tokenomicsDocRef.get();
  const tokenomicsConfig = tokenomicsDocSnap.data();
  const phases: TokenomicsPhaseDto[] = tokenomicsConfig?.phases ?? [];

  const applicablePhase = phases.find(
    (phase) => phase.isActive === true || phase.lastBlockIncluded >= item.blockNumber
  );

  const getUserStakeLevel = getCachedUserStakeLevel();

  await db.runTransaction(async (txn) => {
    if (applicablePhase) {
      const raffles = await getApplicableRaffles(db, chainId, applicablePhase.id);
      for (const raffleSnap of raffles) {
        const raffle = raffleSnap.data();
        if (raffle) {
          const stakeLevel = await getUserStakeLevel(
            item.entrantAddress,
            raffle.stakerContractAddress,
            raffle.stakerContractChainId,
            item.blockNumber
          );
          if (stakeLevel != null) {
            const entrantOrderLedgerItem: EntrantOrderLedgerItem = {
              ...item,
              phaseId: applicablePhase.id,
              phaseIndex: applicablePhase.index,
              phaseName: applicablePhase.name,
              stakerContractAddress: raffle.stakerContractAddress,
              stakerContractChainId: raffle.stakerContractChainId,
              stakeLevel,
              isAggregated: false,
              updatedAt: Date.now()
            };
            const raffleEntrantLedgerRef = raffleSnap.ref
              .collection(firestoreConstants.RAFFLE_ENTRANTS_COLL)
              .doc(item.entrantAddress)
              .collection(firestoreConstants.RAFFLE_ENTRANTS_LEDGER_COLL);
            const eventDocRef = raffleEntrantLedgerRef.doc(item.order.id);
            txn.set(eventDocRef, entrantOrderLedgerItem);
          }
        }
      }
    }
    txn.set(itemRef, { isAggregated: true, updatedAt: Date.now() }, { merge: true });
  });
}
