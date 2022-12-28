import { ChainId, MergedReferralSaleEvent, ReferralSaleEvent, ReferralTotals } from '@infinityxyz/lib/types/core';
import { UserProfileDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants, formatEth } from '@infinityxyz/lib/utils';

import { FirestoreBatchEventProcessor } from '@/firestore/event-processors/firestore-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';
import { getDefaultFeesGenerated } from '@/lib/rewards/config';
import { getCollectionDisplayData, getNftDisplayData, getUserDisplayData } from '@/lib/utils';

export class ReferralsEventProcessor extends FirestoreBatchEventProcessor<ReferralSaleEvent> {
  protected _isEventProcessed(event: ReferralSaleEvent): boolean {
    return event.isAggregated;
  }

  protected _getUnProcessedEvents(
    ref: CollRef<ReferralSaleEvent> | CollGroupRef<ReferralSaleEvent>
  ): Query<ReferralSaleEvent> {
    return ref.where('isAggregated', '==', false);
  }

  protected _applyUpdatedAtLessThanFilter(
    query: Query<ReferralSaleEvent>,
    timestamp: number
  ): Query<ReferralSaleEvent> {
    return query.where('updatedAt', '<', timestamp);
  }

  protected async _processEvents(
    events: QuerySnap<ReferralSaleEvent>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<ReferralSaleEvent>
  ): Promise<void> {
    const referralTotalsRef = eventsRef.parent as DocRef<ReferralTotals>;
    const referralTotalsSnap = await txn.get(referralTotalsRef);

    let referralTotals = referralTotalsSnap.data();
    if (!referralTotals) {
      referralTotals = await this._getDefaultReferralTotals(referralTotalsRef);
    }
    const usersRef = eventsRef.firestore.collection(firestoreConstants.USERS_COLL);

    for (const doc of events.docs) {
      const event = doc.data();
      if (event) {
        const buyerRef = usersRef.doc(event.sale.buyer) as DocRef<UserProfileDto>;
        const sellerRef = usersRef.doc(event.sale.seller) as DocRef<UserProfileDto>;
        const collection = await getCollectionDisplayData(
          eventsRef.firestore,
          event.sale.collectionAddress,
          event.sale.chainId as ChainId
        );

        const [buyer, seller, asset] = await Promise.all([
          getUserDisplayData(buyerRef),
          getUserDisplayData(sellerRef),
          getNftDisplayData(
            eventsRef.firestore,
            event.sale.collectionAddress,
            event.sale.chainId as ChainId,
            event.sale.tokenId,
            collection
          )
        ]);

        const mergedEvent: MergedReferralSaleEvent = {
          ...event,
          isDisplayDataMerged: true,
          asset,
          buyer,
          seller,
          referrer: referralTotals.referrer,
          isAggregated: true,
          updatedAt: Date.now()
        };

        referralTotals.stats.numReferralSales += 1;
        const feesGeneratedWei = (
          BigInt(referralTotals.stats.totalFeesGenerated.feesGeneratedWei) +
          BigInt(event.referralFeesGenerated.feesGeneratedWei)
        ).toString();
        referralTotals.stats.totalFeesGenerated.feesGeneratedWei = feesGeneratedWei;
        referralTotals.stats.totalFeesGenerated.feesGeneratedEth = formatEth(feesGeneratedWei);
        referralTotals.stats.totalFeesGenerated.feesGeneratedUSDC = formatEth(feesGeneratedWei) * event.ethPrice;

        txn.set(doc.ref, mergedEvent, { merge: true });
      }
    }
    txn.set(referralTotalsRef, referralTotals, { merge: true });
  }

  protected async _getDefaultReferralTotals(docRef: DocRef<ReferralTotals>): Promise<ReferralTotals> {
    const chainId = docRef.id as ChainId;
    const userRef = docRef.parent.parent;
    if (!userRef) {
      throw new Error('Invalid user ref');
    }
    const user = await getUserDisplayData(userRef as DocRef<UserProfileDto>);
    const totals = {
      referrer: user,
      metadata: {
        chainId,
        updatedAt: 0
      },
      stats: {
        numReferralSales: 0,
        totalFeesGenerated: getDefaultFeesGenerated()
      }
    };
    return totals;
  }
}
