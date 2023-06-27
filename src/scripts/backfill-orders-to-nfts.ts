import { start } from 'repl';

import { ChainId, ChainNFTs, ChainOBOrder, RawFirestoreOrderWithoutError } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { SupportedCollectionsProvider } from '@/lib/collections/supported-collections-provider';
import { backfillActiveListings } from '@/lib/reservoir/order-events/backfill-active-orders';

async function main() {
  const db = getDb();
  const batchHandler = new BatchHandler(100);

  if (process.argv.length === 3) {
    const chainId = process.argv[2].split(':')[0];
    const collectionAddress = process.argv[2].split(':')[1].toLowerCase();
    await backfillOrdersToNFTs(chainId, trimLowerCase(collectionAddress), db, batchHandler);
  } else {
    const supportedCollections = new SupportedCollectionsProvider(db);
    await supportedCollections.init();

    const startAfterColl = '0xfe8c6d19365453d26af321d0e8c910428c23873f';
    for (const item of supportedCollections.values()) {
      const [chainId, collectionAddress] = item.split(':');
      if (collectionAddress.toLowerCase() <= startAfterColl) {
        continue;
      }
      console.log('Backfilling', chainId, collectionAddress);
      await backfillOrdersToNFTs(chainId as ChainId, trimLowerCase(collectionAddress), db, batchHandler);
    }
  }

  await batchHandler.flush();
  console.log('Done!');
}

async function backfillOrdersToNFTs(
  chainId: ChainId | string,
  collection: string,
  db: FirebaseFirestore.Firestore,
  batchHandler: BatchHandler,
  startAfterDoc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData> | undefined = undefined
) {
  const ordersV2Ref = db.collection('ordersV2');

  let ordersV2Query = ordersV2Ref.where('order.collection', '==', collection).orderBy('order.collection', 'asc');
  if (startAfterDoc) {
    ordersV2Query = ordersV2Query.startAfter(startAfterDoc);
  }
  ordersV2Query = ordersV2Query.limit(200);

  const data = await ordersV2Query.get();
  if (data.docs.length === 0) {
    console.log('============ No more docs for collection', collection, 'on chain', chainId, ' ============');
    return;
  }

  console.log('Processing', data.docs.length, 'docs');
  for (const doc of data.docs) {
    const order = doc.data() as RawFirestoreOrderWithoutError;
    if (order.order.status !== 'active') {
      continue;
    }
    const orderId = doc.id;
    const infinityOrderNFTs = order.rawOrder.infinityOrder.nfts as ChainNFTs[];
    for (const nft of infinityOrderNFTs) {
      const collectionAddress = nft.collection;
      for (const token of nft.tokens) {
        const tokenId = token.tokenId;
        const docRef = db
          .collection('collections')
          .doc(`${chainId}:${collectionAddress}`)
          .collection('nfts')
          .doc(`${tokenId}`)
          .collection('tokenV2Orders')
          .doc(orderId);

        const data = {
          metadata: {
            processed: false
          },
          rawOrder: order.rawOrder
        };
        batchHandler.addAsync(docRef, data, { merge: true });
      }
    }
  }

  // recurse
  startAfterDoc = data.docs[data.docs.length - 1];
  if (startAfterDoc) {
    console.log('Recursing after docId', startAfterDoc.id);
    await backfillOrdersToNFTs(chainId, collection, db, batchHandler, startAfterDoc);
  }
}

void main();
