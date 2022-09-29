import { InfinityStakerABI } from '@infinityxyz/lib/abi/infinityStaker';
import { ChainId, EntrantOrderLedgerItem, PreMergeEntrantOrderLedgerItem } from '@infinityxyz/lib/types/core';
import { TokenomicsConfigDto, TokenomicsPhaseDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { ethers } from 'ethers';
import { getProvider } from '../../utils/ethersUtils';
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

  const cache: Map<string, Promise<number | null>> = new Map();
  const getCacheId = (
    userAddress: string,
    stakerContractAddress: string,
    stakerContractChainId: ChainId,
    blockNumber: number
  ) => {
    return `${userAddress}-${stakerContractAddress}-${stakerContractChainId}-${blockNumber}`;
  };
  const getUserStakeLevel = (
    userAddress: string,
    stakerContractAddress: string,
    stakerContractChainId: ChainId,
    blockNumber: number
  ) => {
    const id = getCacheId(userAddress, stakerContractAddress, stakerContractChainId, blockNumber);
    const cachedStakeLevel = cache.get(id);

    const getStakeLevel = async (): Promise<number | null> => {
      try {
        const stakerContract = new ethers.Contract(stakerContractAddress, InfinityStakerABI, getProvider(chainId));
        const [stakeLevel] = (await stakerContract.functions.getUserStakeLevel(item.entrantAddress, {
          blockTag: item.blockNumber
        })) as [number];
        return stakeLevel;
      } catch (err) {
        console.error(err);
        return null;
      }
    };

    if (cachedStakeLevel) {
      return cachedStakeLevel;
    }
    const promise = getStakeLevel();
    cache.set(id, promise);
    return promise;
  };

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
              .collection('raffleEntrants')
              .doc(item.entrantAddress)
              .collection('raffleEntrantLedger');
            const eventDocRef = raffleEntrantLedgerRef.doc(item.order.id);
            txn.set(eventDocRef, entrantOrderLedgerItem);
          }
        }
      }
    }
    txn.set(itemRef, { isAggregated: true, updatedAt: Date.now() }, { merge: true });
  });
}

