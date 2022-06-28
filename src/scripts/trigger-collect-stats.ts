import { firestoreConstants } from "@infinityxyz/lib/utils/constants";
import { getDb } from "../firestore";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fetch = require("node-fetch");

// This background task loops through all collections in DB
// and trigger /collect-stats on each collection.

// - 2000 reqs / 1 hour (3600s)   => 1.8 req / sec
const TRIGGER_TIMER = 500; // every 500 ms
const TRIGGER_ENDPOINT = `http://localhost:9090/collections/collect-stats?list=`; // todo: use the Prod URL?

type Item = {
  address: string;
};

async function main() {
  console.log("Trigger /collect-stats for all collections:");
  const db = getDb();

  const collectionRef = db.collection(firestoreConstants.COLLECTIONS_COLL);

  const nftsQuery = await collectionRef.select("address").get(); // use .limit(5) for testing

  const items = nftsQuery.docs ?? [];
  let timer = 0;
  console.log("Total collections:", items.length);

  for (const item of items) {
    const itemData = item.data() as Item;
    if (itemData.address) {
      timer += TRIGGER_TIMER; // every 500ms
      setTimeout(() => {
        const address = itemData.address;
        fetch(`${TRIGGER_ENDPOINT}${address}`)
          .then(() => {
            console.log("/collect-stats", address);
          })
          .catch((err: any) => console.error(err));
      }, timer);
    }
  }
}

void main();
