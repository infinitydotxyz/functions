import * as functions from 'firebase-functions';

import { Collection } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';

import { config } from '@/config/index';

import { updateNftsWithCollection } from './update-nfts-with-collection';

export const syncNftCollectionData = functions
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

    const nftFields = [nameAccessor, slugAccessor, hasBlueCheckAccessor];

    let requiresNftUpdate = false;
    for (const nftField of nftFields) {
      if (nftField(before) !== nftField(after)) {
        requiresNftUpdate = true;
      }
    }

    if (requiresNftUpdate) {
      await updateNftsWithCollection(after, change.after.ref);
    }
  });
