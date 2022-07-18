import { Collection, Token } from '@infinityxyz/lib/types/core';
import { firestoreConstants, NULL_ADDRESS } from '@infinityxyz/lib/utils';
import { getDb } from '../firestore';
import FirestoreBatchHandler from '../firestore/batch-handler';
import { streamQueryWithRef } from '../firestore/stream-query';

export async function backfillSignedOrderToSnippet() {
  const db = getDb();

  const collectionsRef = db.collection(
    firestoreConstants.COLLECTIONS_COLL
  ) as FirebaseFirestore.CollectionReference<Collection>;
  const stream = streamQueryWithRef(collectionsRef, (doc, ref) => [ref], { pageSize: 100 });

  let chain = '1';
  let numCollections = 0;
  let numListings = 0;
  let numOffers = 0;
  let currentCollection = NULL_ADDRESS;

  const interval = setInterval(() => {
    const progress = Math.floor(10000 * (parseInt(currentCollection.slice(0, 5), 16) / parseInt('0xfff', 16))) / 100;
    console.log(
      `[Chain: ${chain}] [${progress}%] ${currentCollection} Collections checked: ${numCollections} Listings found: ${numListings} Offers found: ${numOffers}`
    );
  }, 5_000);

  for await (const collection of stream) {
    numCollections += 1;
    [chain, currentCollection] = collection.ref.id.split(':');
    const nfts = collection.ref.collection(firestoreConstants.COLLECTION_NFTS_COLL);
    const listings = nfts.where('ordersSnippet.listing.hasOrder', '==', true);
    const offers = nfts.where('ordersSnippet.offer.hasOrder', '==', true);

    const nftsWithListingsStream = await listings.get();
    const batchHandler = new FirestoreBatchHandler();

    for (const snap of nftsWithListingsStream.docs) {
      numListings += 1;
      const nftWithListing = snap.data();
      const orderId = nftWithListing?.ordersSnippet?.listing?.orderItem?.id;
      if (orderId) {
        const orderSnap = await db.collection(firestoreConstants.ORDERS_COLL).doc(orderId).get();
        const order = orderSnap.data();
        if (order) {
          const update: Partial<Token> = {
            ordersSnippet: {
              ...nftWithListing.ordersSnippet,
              listing: {
                ...nftWithListing.ordersSnippet?.listing,
                hasOrder: true,
                signedOrder: order.signedOrder ?? {}
              }
            }
          };
          batchHandler.add(snap.ref, update, { merge: true });
        }
      }
    }

    await batchHandler.flush();

    const nftsWithOffersStream = await offers.get();
    for (const snap of nftsWithOffersStream.docs) {
      numOffers += 1;
      const nftWithOffer = snap.data();
      const orderId = nftWithOffer?.ordersSnippet?.offer?.orderItem?.id;
      if (orderId) {
        const orderSnap = await db.collection(firestoreConstants.ORDERS_COLL).doc(orderId).get();
        const order = orderSnap.data();
        if (order) {
          const update: Partial<Token> = {
            ordersSnippet: {
              ...nftWithOffer.ordersSnippet,
              offer: {
                ...nftWithOffer.ordersSnippet?.offer,
                hasOrder: true,
                signedOrder: order.signedOrder
              }
            }
          };
          batchHandler.add(snap.ref, update, { merge: true });
        }
      }
    }
    await batchHandler.flush();
  }

  clearInterval(interval);

  console.log(`Complete`);
}

void backfillSignedOrderToSnippet();
