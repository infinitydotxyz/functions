import { FieldPath } from 'firebase-admin/firestore';

import { OrderDirection } from '@infinityxyz/lib/types/core';
import { CollectionDto, NftDto } from '@infinityxyz/lib/types/dto';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { FirestoreInOrderBatchEventProcessor } from '@/firestore/event-processors/firestore-in-order-batch-event-processor';
import { CollGroupRef, CollRef, DocRef, Query, QuerySnap } from '@/firestore/types';

import { NftSaleEventV2 } from './types';

export class NftSalesProcessor extends FirestoreInOrderBatchEventProcessor<NftSaleEventV2> {
  protected _applyOrderBy<Events extends { metadata: { timestamp: number } } = NftSaleEventV2>(
    query: CollRef<Events> | Query<Events>,
    direction: OrderDirection
  ): {
    query: Query<Events>;
    getStartAfterField: (
      item: Events,
      ref: FirebaseFirestore.DocumentReference<Events>
    ) => (string | number | FirebaseFirestore.DocumentReference<Events>)[];
  } {
    const q = query.orderBy('metadata.timestamp', direction).orderBy(FieldPath.documentId(), direction);

    return {
      query: q,
      getStartAfterField: (item, ref) => [item.metadata.timestamp, ref]
    };
  }

  protected _applyOrderByLessThan<Events extends { metadata: { timestamp: number } } = NftSaleEventV2>(
    query: CollRef<Events> | Query<Events>,
    timestamp: number
  ): Query<Events> {
    return query.where('metadata.timestamp', '<', timestamp);
  }

  protected _isEventProcessed(event: NftSaleEventV2): boolean {
    return event.metadata.processed;
  }

  protected _getUnProcessedEvents<Event extends { metadata: { processed: boolean } } = NftSaleEventV2>(
    ref: CollRef<Event> | CollGroupRef<Event>
  ): Query<Event> {
    return ref.where('metadata.processed', '==', false);
  }

  protected _applyUpdatedAtLessThanAndOrderByFilter(
    query: Query<NftSaleEventV2>,
    timestamp: number
  ): {
    query: Query<NftSaleEventV2>;
    getStartAfterField: (
      item: NftSaleEventV2,
      ref: DocRef<NftSaleEventV2>
    ) => (string | number | DocRef<NftSaleEventV2>)[];
  } {
    const q = query
      .where('metadata.updatedAt', '<', timestamp)
      .orderBy('metadata.updatedAt', 'asc')
      .orderBy(FieldPath.documentId(), 'asc');

    const getStartAfterField = (item: NftSaleEventV2, ref: DocRef<NftSaleEventV2>) => {
      return [item.metadata.updatedAt, ref];
    };

    return { query: q, getStartAfterField };
  }

  protected async _processEvents(
    events: QuerySnap<NftSaleEventV2>,
    txn: FirebaseFirestore.Transaction,
    eventsRef: CollRef<NftSaleEventV2>
  ) {
    const items = events.docs.map((item) => {
      return {
        data: item.data(),
        ref: item.ref
      };
    });

    this._sortSales(items);

    let mostRecentSale:
      | {
          data: NftSaleEventV2;
          ref: FirebaseFirestore.DocumentReference<NftSaleEventV2>;
        }
      | undefined = items[items.length - 1];

    if (!mostRecentSale) {
      const mostRecentSalesQuery = eventsRef.orderBy('metadata.timestamp', 'desc').limit(10);

      const mostRecentSalesSnap = await txn.get(mostRecentSalesQuery);
      const mostRecentSales = mostRecentSalesSnap.docs.map((item) => {
        return {
          data: item.data(),
          ref: item.ref
        };
      });

      this._sortSales(mostRecentSales);

      mostRecentSale = mostRecentSales?.[0];
    }

    if (mostRecentSale) {
      const chainId = mostRecentSale.data.data.chainId;
      const tokenId = mostRecentSale.data.data.tokenId;
      const address = mostRecentSale.data.data.collectionAddress;
      const collectionRef = eventsRef.firestore
        .collection(firestoreConstants.COLLECTIONS_COLL)
        .doc(`${chainId}:${address}`) as DocRef<CollectionDto>;
      const tokenRef = collectionRef.collection(firestoreConstants.COLLECTION_NFTS_COLL).doc(tokenId) as DocRef<NftDto>;

      const tokenUpdate: Partial<NftDto> = {
        lastSalePriceEth: mostRecentSale.data.data.salePriceEth,
        lastSaleTimestamp: mostRecentSale.data.data.saleTimestamp
      };

      txn.set(tokenRef, tokenUpdate, { merge: true });
    }

    for (const item of items) {
      const metadataUpdate: NftSaleEventV2['metadata'] = {
        ...item.data.metadata,
        processed: true,
        updatedAt: Date.now()
      };

      txn.set(
        item.ref,
        {
          metadata: metadataUpdate as any
        },
        { merge: true }
      );
    }
  }

  protected _sortSales(sales: { data: NftSaleEventV2; ref: FirebaseFirestore.DocumentReference<NftSaleEventV2> }[]) {
    sales.sort((a, b) => {
      if (a.data.data.blockNumber < b.data.data.blockNumber) {
        return -1;
      } else if (a.data.data.blockNumber > b.data.data.blockNumber) {
        return 1;
      }

      if (a.data.data.logIndex < b.data.data.logIndex) {
        return -1;
      } else if (a.data.data.logIndex > b.data.data.logIndex) {
        return 1;
      }

      if (a.data.data.bundleIndex < b.data.data.bundleIndex) {
        return -1;
      } else if (a.data.data.bundleIndex > b.data.data.bundleIndex) {
        return 1;
      }

      return 0;
    });
  }
}
