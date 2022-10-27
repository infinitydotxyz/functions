import { EventType, FeedEvent, SaleSource } from '@infinityxyz/lib/types/core';
import { firestoreConstants } from '@infinityxyz/lib/utils/constants';
import * as functions from 'firebase-functions';
import { REGION } from '../../utils/constants';
import { notifySocials } from './notify-socials';

export const onFeedWrite = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540
  })
  .firestore.document(`${firestoreConstants.FEED_COLL}/{documentId}`)
  .onWrite(async ({after}) => {
    try {
      const type: EventType = after.get('type');

      if ((type === EventType.NftSale && after.get('source') === SaleSource.Infinity) || type === EventType.NftOffer || type === EventType.NftListing) {
        const document = after.data() as FeedEvent;
        await notifySocials(document);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  });
