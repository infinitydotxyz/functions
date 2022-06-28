import { OrderDirection } from "@infinityxyz/lib/types/core";
import { firestoreConstants } from "@infinityxyz/lib/utils/constants";
import PQueue from "p-queue";
import { getDb } from "../firestore";
import { streamQuery } from "../firestore/stream-query";
import { sleep } from "../utils";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require("node-fetch");

// This background task loops through all collections in DB
// and trigger /collect-stats on each collection.

const TRIGGER_TIMER = 1000; // every 1s
const TRIGGER_ENDPOINT = `http://localhost:9090/collections/collect-stats?list=`; // todo: use the Prod URL?

type Item = {
  address: string;
};

async function main() {
  console.log("Trigger /collect-stats for all collections:");
  const db = getDb();

  const collectionRef = db.collection(firestoreConstants.COLLECTIONS_COLL);

  const query = collectionRef
    .select("address")
    .orderBy(
      "__name__",
      OrderDirection.Ascending // orderBy is required to support pagination
    ) as FirebaseFirestore.Query<Item>;

  const startAfter = (item: Item, ref: FirebaseFirestore.DocumentReference) => {
    return [ref.id];
  };

  const pageSize = 100;
  const collectionsStream = streamQuery(query, startAfter, { pageSize });
  const queue = new PQueue({ concurrency: pageSize });

  for await (const item of collectionsStream) {
    if (item.address) {
      void queue
        .add(() => {
          fetch(`${TRIGGER_ENDPOINT}${item.address}`)
            .then(() => {
              console.log("/collect-stats", item.address);
            })
            .catch((err: any) => console.error(err));
        })
        .catch(console.error);
    }
    if (queue.pending === pageSize) {
      console.log(`Waiting for queue to drain...`);
      await queue.onIdle();
      console.log(`Queue drained.`);
    }
    await sleep(TRIGGER_TIMER);
  }
}

void main();
