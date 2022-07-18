import { Token } from "@infinityxyz/lib/types/core";
import { firestoreConstants } from "@infinityxyz/lib/utils";
import { getDb } from "../firestore";
import FirestoreBatchHandler from "../firestore/batch-handler";


export async function backfillSignedOrderToSnippet() {
    const db = getDb();

    const listings = db.collectionGroup(firestoreConstants.COLLECTION_NFTS_COLL).where('ordersSnippet.listing.hasOrder', '==', true);
    const offers = db.collectionGroup(firestoreConstants.COLLECTION_NFTS_COLL).where('ordersSnippet.offer.hasOrder', '==', true);

    const nftsWithListingsStream = listings.stream() as AsyncIterable<FirebaseFirestore.DocumentSnapshot<Token>>;
    const batchHandler = new FirestoreBatchHandler();

    for await (const snap of nftsWithListingsStream) {
        const nftWithListing = snap.data();
        const orderId = nftWithListing?.ordersSnippet?.listing?.orderItem?.id;
        if(orderId) {
            const orderSnap = await db.collection(firestoreConstants.ORDERS_COLL).doc(orderId).get();
            const order = orderSnap.data();
            if(order) {
                const update: Partial<Token> = {
                    ordersSnippet: {
                        ...nftWithListing.ordersSnippet,
                        listing: {
                            ...nftWithListing.ordersSnippet?.listing,
                            hasOrder: true,
                            signedOrder: order.signedOrder
                        }
                    }
                }
                batchHandler.add(snap.ref, update, { merge: true });
            }
        }
    }

    await batchHandler.flush();


    const nftsWithOffersStream = offers.stream() as AsyncIterable<FirebaseFirestore.DocumentSnapshot<Token>>;
    for await (const snap of nftsWithOffersStream) {
        const nftWithOffer = snap.data();
        const orderId = nftWithOffer?.ordersSnippet?.offer?.orderItem?.id;
        if(orderId) {
            const orderSnap = await db.collection(firestoreConstants.ORDERS_COLL).doc(orderId).get();
            const order = orderSnap.data();
            if(order) {
                const update: Partial<Token> = {
                    ordersSnippet: {
                        ...nftWithOffer.ordersSnippet,
                        offer: {
                            ...nftWithOffer.ordersSnippet?.offer,
                            hasOrder: true,
                            signedOrder: order.signedOrder
                        }
                    }
                }
                batchHandler.add(snap.ref, update, { merge: true });
            }
        }
    }
    await batchHandler.flush();
}

void backfillSignedOrderToSnippet();