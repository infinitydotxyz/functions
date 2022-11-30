import { ChainId } from "@infinityxyz/lib/types/core";
import * as Reservoir from "../reservoir";
import { getDb } from "../firestore";


async function main() {
    const db = getDb();
    await Reservoir.OrderEvents.unpauseSyncs(db, ChainId.Mainnet, ['ask']);
    const sync = await Reservoir.OrderEvents.SyncMetadata.getChainSyncMetadata(db, ChainId.Mainnet, "ask");

    const syncer = Reservoir.OrderEvents.sync(db, sync, 1);

    for await(const item of syncer) {
        console.log(item);
    }
}

void main();