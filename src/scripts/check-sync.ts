import { getDb } from '@/firestore/db';

import { config } from '../config';
import { Reservoir } from '../lib';

async function main() {
  const db = getDb();
  const syncsRef = Reservoir.OrderEvents.SyncMetadata.getOrderEventSyncsRef(db);

  const syncsSnap = await syncsRef.get();

  for (const item of syncsSnap.docs) {
    const data = item.data();
    if (data.metadata.isPaused) {
      console.log(`Sync: ${item.ref.id} is paused`);
    } else {
      const continuation = data.data.continuation;
      const type = data.metadata.type;
      let method;
      switch (type) {
        case 'ask':
        case 'collection-ask':
          method = Reservoir.Api.Events.AskEvents.getEvents;
          break;
        case 'bid':
        case 'collection-bid':
          method = Reservoir.Api.Events.BidEvents.getEvents;
          break;
        default:
          console.warn(`Unsupported type: ${type}`);
          continue;
      }

      const client = Reservoir.Api.getClient(data.metadata.chainId, config.reservoir.apiKey);
      const collection = data.metadata.collection ? { contract: data.metadata.collection } : {};
      const nextPage = await method(client, {
        ...collection,
        continuation,
        limit: 1,
        sortDirection: 'asc'
      });

      const nextId = nextPage.data.events[0].event.id;

      const mostRecentPage = await method(client, {
        ...collection,
        limit: 1,
        sortDirection: 'desc'
      });

      const currentId = mostRecentPage.data.events[0].event.id;

      console.log(
        `Sync ${item.ref.id} At: ${nextId} Reservoir at: ${currentId} Difference ${BigInt(currentId) - BigInt(nextId)}`
      );
    }
  }
}

void main();
