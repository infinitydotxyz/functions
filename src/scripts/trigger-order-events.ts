import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

import { BatchHandler } from '@/firestore/batch-handler';
import { getDb } from '@/firestore/db';
import { streamQueryWithRef } from '@/firestore/stream-query';
import { DocRef, Query } from '@/firestore/types';
import { ReservoirOrderEvent } from '@/lib/reservoir/order-events/types';

import { config } from '../config';

async function main() {
  const db = getDb();

  const checkpointFile = resolve(`sync/trigger-order-events-${config.isDev ? 'dev' : 'prod'}.txt`);
  const checkpoint = await readFile(checkpointFile, 'utf8');
  const saveCheckpoint = async (ref: DocRef<ReservoirOrderEvent>) => {
    await writeFile(checkpointFile, ref.path);
  };

  let query = db.collectionGroup('reservoirOrderEvents') as unknown as Query<ReservoirOrderEvent>;

  if (checkpoint) {
    console.log(`Continuing from last checkpoint: ${checkpoint}`);
    const startAfterRef = db.doc(checkpoint);
    query = query.startAfter(startAfterRef);
  }

  const stream = streamQueryWithRef(query);

  const batch = new BatchHandler(100);
  let triggered = 0;

  const trigger = async (data: ReservoirOrderEvent, ref: DocRef<ReservoirOrderEvent>) => {
    triggered += 1;
    await batch.addAsync(
      ref,
      {
        metadata: {
          ...data.metadata,
          processed: false,
          hasError: false
        },
        error: null
      },
      { merge: true }
    );
    console.log(`Triggering event ${ref.path}`);
    if (triggered % 500 === 0) {
      await saveCheckpoint(ref);
    }
  };

  for await (const { data, ref } of stream) {
    if ('error' in data && data.error && data.error.errorCode !== 1) {
      switch (data.error.reason) {
        case 'Invalid complication address': {
          await trigger(data, ref);
          break;
        }

        case 'unexpected order: unexpected order: error': {
          if (data.error.value.includes('failed to get reservoir order')) {
            await trigger(data, ref);
          } else {
            console.log(`Unhandled reason: ${data.error.reason} - ${data.error.value}`);
          }
          break;
        }
        case 'unsupported order: unsupported order: dynamic order': {
          break;
        }
        case 'unsupported order: unsupported order: non-erc721 order': {
          break;
        }
        case 'unexpected order: unexpected order: not found': {
          break;
        }
        case 'unsupported order: unsupported order: order currency': {
          break;
        }
        default: {
          console.log(`Unhandled reason: ${data.error.reason} - ${data.error.value} - ${ref.path}`);
        }
      }
    }
  }

  await batch.flush();

  console.log(`Complete: Triggered `);
}

void main();
