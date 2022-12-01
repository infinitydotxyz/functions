import * as functions from 'firebase-functions';

import { Collection } from '@infinityxyz/lib/types/core/Collection';
import { firestoreConstants } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';

import { updateStatsWithCollection } from './update-stats-with-collection';

export const syncStatsCollectionData = functions
  .region(config.firebase.region)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(`${firestoreConstants.COLLECTIONS_COLL}/{collectionId}`)
  .onWrite(async (change) => {
    const before = (change.before.data() ?? {}) as Partial<Collection>;
    const after = (change.after.data() ?? {}) as Partial<Collection>;

    const nameAccessor = (collection: Partial<Collection>) => collection?.metadata?.name;
    const slugAccessor = (collection: Partial<Collection>) => collection?.slug;
    const hasBlueCheckAccessor = (collection: Partial<Collection>) => collection?.hasBlueCheck;
    const profileImageAccessor = (collection: Partial<Collection>) => collection?.metadata?.profileImage;
    const bannerImageAccessor = (collection: Partial<Collection>) => collection?.metadata?.bannerImage;
    const numNftsAccessor = (collection: Partial<Collection>) => collection?.numNfts;
    const numOwnersAccessor = (collection: Partial<Collection>) => collection?.numOwners;

    const accessors = [
      nameAccessor,
      slugAccessor,
      hasBlueCheckAccessor,
      profileImageAccessor,
      bannerImageAccessor,
      numNftsAccessor,
      numOwnersAccessor
    ];

    let requiresUpdate = false;
    for (const accessor of accessors) {
      if (accessor(before) !== accessor(after)) {
        requiresUpdate = true;
      }
    }

    if (requiresUpdate) {
      await updateStatsWithCollection(after, change.after.ref.collection(firestoreConstants.COLLECTION_STATS_COLL));

      /**
       * TODO - update nfts with collection data
       * additionally, add a listener to keep nft stats in sync with the nft
       */
    }
  });
