import { Collection } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import FirestoreBatchHandler from '../../firestore/batch-handler';

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
    console.log(
      `Fetching NFTs for collection ${collection?.address} starting after ${tokenIdStartAfter} with limit ${limit}`
    );
    const docs = (
      await collectionRef
        .collection(firestoreConstants.COLLECTION_NFTS_COLL)
        .limit(1000)
        .orderBy('tokenId', 'asc')
        .startAfter(tokenIdStartAfter)
        .get()
    ).docs;

    console.log(`Fetched ${docs.length} NFTs`);

    const lastItem = docs[docs.length - 1];
    if (lastItem) {
      tokenIdStartAfter = lastItem.get('tokenId');
      console.log(`Next tokenId start after: ${tokenIdStartAfter}`);
    }
    if (docs.length < limit || !lastItem) {
      console.log('Done fetching NFTs for collection', collection?.address);
      done = true;
    }

    for (const doc of docs) {
      batchHandler.add(doc.ref, update, { merge: true });
    }
  }

  await batchHandler.flush();
}
