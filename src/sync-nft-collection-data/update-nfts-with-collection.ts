import { Collection } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import FirestoreBatchHandler from '../firestore/batch-handler';

export async function updateNftsWithCollection(
  collection: Partial<Collection>,
  collectionRef: FirebaseFirestore.DocumentReference<Partial<Collection>>
): Promise<void> {
  const update = {
    collectionAddress: collection?.address ?? '',
    collectionName: collection?.metadata?.name ?? '',
    collectionSlug: collection?.slug ?? '',
    collectionProfileImage: collection?.metadata?.profileImage ?? '',
    collectionBannerImage: collection?.metadata?.bannerImage ?? '',
    collectionDescription: collection?.metadata?.description ?? '',
    hasBlueCheck: collection?.hasBlueCheck ?? false
  };

  const batchHandler = new FirestoreBatchHandler();
  let tokenIdStartAfter = '';
  let done = false;
  const limit = 1000;
  while (!done) {
    console.log(`Fetching NFTs for collection ${collection?.address} starting after ${tokenIdStartAfter}`);
    const docs = (
      await collectionRef
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .limit(1000)
        .orderBy('tokenId', 'desc')
        .startAfter(tokenIdStartAfter)
        .get()
    ).docs;
    
    const lastItem = docs[docs.length - 1];
    if (lastItem) {
      tokenIdStartAfter = lastItem.get('tokenId');
    }
    if (docs.length < limit || !lastItem) {
      done = true;
    }

    for (const doc of docs) {
      batchHandler.add(doc.ref, update, { merge: true });
    }
  }

  await batchHandler.flush();
}
