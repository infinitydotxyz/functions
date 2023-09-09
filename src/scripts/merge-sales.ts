import { getDb } from "@/firestore/db";
import { streamQueryWithRef } from "@/firestore/stream-query";
import { config } from "../config";

async function main() {
  const db = getDb();

  console.log(`Merging sales events. ENV: ${config.isDev ? "DEV" : "PROD"}`);
  const salesEvents = db.collection('pixl').doc('salesCollections').collection('salesEvents');

  const stream = streamQueryWithRef(salesEvents);
  for await (const { data: sale, ref } of stream) {
    const rewardSaleEventRef = db.collection('pixl').doc('pixlRewards').collection('pixlRewardEvents').doc(ref.id);

    const snap = await rewardSaleEventRef.get();

    if (!snap.exists) {
      console.log(`Merging sale event ${ref.id}`);
      await rewardSaleEventRef.create({ ...sale, processed: false });
    } else {
      console.log(`Skipping sale event ${ref.id}`);
    }
  }

  console.log(`Completed merging sales events!`);
}

void main();
