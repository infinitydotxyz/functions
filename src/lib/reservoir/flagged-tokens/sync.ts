import { NftFlaggedStatusEvent } from 'functions/tokens/nft-flagged-status-events-processor';
import PQueue from 'p-queue';

import { ChainId } from '@infinityxyz/lib/types/core';
import { firestoreConstants, sleep } from '@infinityxyz/lib/utils';

import { config } from '@/config/index';
import { BatchHandler } from '@/firestore/batch-handler';
import { DocRef } from '@/firestore/types';

import { Reservoir } from '../..';
import { FlaggedTokenEvent } from '../api/tokens/types';
import { SyncMetadata } from './types';

export async function* getFlaggedTokens(_syncData: { mostRecentItem: FlaggedTokenEvent | null }, chainId: ChainId) {
  const client = Reservoir.Api.getClient(chainId, config.reservoir.apiKey);
  const method = Reservoir.Api.Tokens.Flagged.getFlaggedTokens;
  let continuation: string | undefined;
  let attempts = 0;
  let firstItem: FlaggedTokenEvent | undefined;
  const pageSize = 200;

  while (true) {
    const events: FlaggedTokenEvent[] = [];
    try {
      const page = await method(client, {
        continuation,
        limit: pageSize
      });

      for (const item of page.data) {
        if (!firstItem) {
          firstItem = item;
        }

        if (_syncData.mostRecentItem && item.lastFlagChange < _syncData.mostRecentItem.lastFlagChange) {
          console.log(`Hit last processed timestamp ${firstItem?.lastFlagChange ?? ''}`);
          yield { events: events, firstItem, complete: true };
          return;
        }
        events.push(item);
      }

      if (events.length < pageSize) {
        console.log(`Page size less than max. Timestamp ${firstItem?.lastFlagChange ?? ''}`);
        yield { events: events, firstItem, complete: true };
        return;
      } else if (!page.continuation) {
        console.log(`No continuation. Timestamp ${firstItem?.lastFlagChange ?? ''}`);
        yield { events: events, complete: true, firstItem };
        return;
      }
      continuation = page.continuation;
      attempts = 0;
      yield { events: events, complete: false };
    } catch (err) {
      attempts += 1;
      if (attempts > 3) {
        throw err;
      }
      console.error(err);
      await sleep(3000);
    }
  }
}

export async function* sync(
  db: FirebaseFirestore.Firestore,
  initialSync: { data: SyncMetadata; ref: DocRef<SyncMetadata> }
) {
  let pageNumber = 0;
  let totalItemsProcessed = 0;

  while (true) {
    const { lastItemProcessed, numEvents } = await db.runTransaction(async (txn) => {
      const snap = await txn.get(initialSync.ref);
      const currentSync = snap.data() as SyncMetadata;

      if (currentSync.metadata.isPaused) {
        throw new Error('Sync paused');
      }

      const processEvents = async () => {
        let numEvents = 0;
        const iterator = getFlaggedTokens(
          { mostRecentItem: currentSync.data.mostRecentItem },
          initialSync.data.metadata.chainId
        );
        let result: { success: boolean; error: Error | null } = { success: true, error: null };
        const worker = new PQueue({ concurrency: 20 });

        for await (const page of iterator) {
          worker
            .add(async () => {
              const batch = new BatchHandler();
              for (const event of page.events) {
                const tokenRef = db
                  .collection(firestoreConstants.COLLECTIONS_COLL)
                  .doc(`${currentSync.metadata.chainId}:${event.collectionAddress}`)
                  .collection(firestoreConstants.COLLECTION_NFTS_COLL)
                  .doc(event.tokenId);

                const id = `${event.collectionAddress}:${event.tokenId}:${event.lastFlagChange}`;
                const tokenFlaggedStatusEventRef = tokenRef.collection('tokenFlaggedStatusEvents').doc(id);

                const eventWithMetadata: NftFlaggedStatusEvent = {
                  data: event,
                  metadata: {
                    timestamp: event.lastFlagChange,
                    updatedAt: Date.now(),
                    processed: false
                  }
                };
                await batch.addAsync(tokenFlaggedStatusEventRef, eventWithMetadata, { merge: true });
              }

              await batch.flush();
            })
            .catch((err) => {
              result = {
                success: false,
                error: err as Error
              };
            });
          numEvents += page.events.length;
          if (page.complete) {
            console.log(`Hit end of page, waiting for all events to to saved`);
            await worker.onIdle();
            if (!result.success) {
              throw result.error;
            }
            return { lastItemProcessed: page.firstItem, numEvents };
          }
        }

        console.log(`Hit end of page, waiting for all events to to saved`);
        await worker.onIdle();

        if (!result.success) {
          throw result.error;
        }

        throw new Error('Failed to complete sync');
      };

      const { lastItemProcessed, numEvents } = await processEvents();
      if (!lastItemProcessed) {
        throw new Error('No last item processed');
      }
      txn.set(
        initialSync.ref,
        {
          data: {
            mostRecentItem: lastItemProcessed,
            eventsProcessed: currentSync.data.eventsProcessed + numEvents
          }
        },
        { merge: true }
      );
      return { numEvents, lastItemProcessed };
    });

    pageNumber += 1;
    totalItemsProcessed += numEvents;
    yield { numItemsInPage: numEvents, pageNumber, totalItemsProcessed, lastItemProcessed };
  }
}
