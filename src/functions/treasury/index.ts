import { ChainId } from '@infinityxyz/lib/types/core';
import { FeesGeneratedDto } from '@infinityxyz/lib/types/dto';
import { formatEth, ONE_MIN } from '@infinityxyz/lib/utils';
import * as functions from 'firebase-functions';
import { getDb } from '../../firestore';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { paginatedTransaction } from '../../firestore/paginated-transaction';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { TreasuryBalanceAddedEvent } from '../../rewards/trading-fee-program-handlers/treasury-handler';
import { REGION } from '../../utils/constants';

interface TreasuryDoc { // TODO move to lib, use firestore constants for paths
  chainId: ChainId;
  feesGenerated: Omit<FeesGeneratedDto, 'feesGeneratedUSDC'>;
  phases: {
    [id: string]: {
      phaseName: string;
      phaseId: string;
      phaseIndex: number;
      feesGenerated: Omit<FeesGeneratedDto, 'feesGeneratedUSDC'>;
    };
  };
}

export const onTreasuryLedgerEvent = functions
  .region(REGION)
  .runWith({
    timeoutSeconds: 540,
    maxInstances: 1 // run 1 instance to support batch aggregation on any event change
  })
  .firestore.document(`treasury/{chainId}/treasuryLedger/{treasuryLedgerEvent}`)
  .onWrite(async (snapshot) => {
    const ledgerRef = snapshot.after.ref.parent as FirebaseFirestore.CollectionReference<TreasuryBalanceAddedEvent>;
    await aggregatedTreasuryEvents(ledgerRef);
  });

export const triggerTreasuryLedgerAggregation = functions
  .region(REGION)
  .pubsub.schedule('every 15 minutes')
  .onRun(async () => {
    const db = getDb();

    const treasuryLedgersRef = db.collectionGroup(
      'treasuryLedger'
    ) as FirebaseFirestore.CollectionGroup<TreasuryBalanceAddedEvent>;

    const maxAge = ONE_MIN * 15;
    const query = treasuryLedgersRef.where('isAggregated', '==', false).where('updatedAt', '<', Date.now() - maxAge);

    const stream = streamQueryWithRef(query, (_, ref) => [ref], { pageSize: 300 });

    const paths = new Set<string>();
    const batch = new FirestoreBatchHandler();
    for await (const { ref } of stream) {
      if (!paths.has(ref.parent.path)) {
        paths.add(ref.parent.path);
        await batch.addAsync(ref, { updatedAt: Date.now() }, { merge: true });
      }
    }
    await batch.flush();
  });

export async function aggregatedTreasuryEvents(
  ledgerRef: FirebaseFirestore.CollectionReference<TreasuryBalanceAddedEvent>
) {
  const query = ledgerRef.where('isAggregated', '==', false);

  await paginatedTransaction(query, ledgerRef.firestore, { pageSize: 300, maxPages: 10 }, async ({ data, txn }) => {
    const treasuryDoc = ledgerRef.parent as FirebaseFirestore.DocumentReference<TreasuryDoc>;
    if (!treasuryDoc) {
      throw new Error('Invalid treasury doc');
    }
    const treasurySnap = await txn.get(treasuryDoc);
    let treasury = treasurySnap.data() as TreasuryDoc;

    if (!treasury) {
      treasury = {
        chainId: treasuryDoc.id as ChainId,
        feesGenerated: {
          feesGeneratedWei: '0',
          feesGeneratedEth: 0
        },
        phases: {}
      };
    }

    for (const item of data.docs) {
      const event = item.data();
      if (!event) {
        continue;
      }

      const feesGenerated = treasury.feesGenerated ?? {
        feesGeneratedWei: '0',
        feesGeneratedEth: 0
      };
      const phaseFeesGenerated = (treasury.phases ?? {})[event.phaseId] ?? {
        feesGeneratedWei: '0',
        feesGeneratedEth: 0,
        phaseName: event.phaseName,
        phaseId: event.phaseId,
        phaseIndex: event.phaseIndex
      };

      feesGenerated.feesGeneratedWei = (
        BigInt(feesGenerated.feesGeneratedWei) + BigInt(event.contributionWei)
      ).toString();
      phaseFeesGenerated.feesGenerated.feesGeneratedWei = (
        BigInt(phaseFeesGenerated.feesGenerated.feesGeneratedWei) + BigInt(event.contributionWei)
      ).toString();

      feesGenerated.feesGeneratedEth = formatEth(feesGenerated.feesGeneratedWei);
      phaseFeesGenerated.feesGenerated.feesGeneratedEth = formatEth(phaseFeesGenerated.feesGenerated.feesGeneratedWei);

      treasury.feesGenerated = feesGenerated;
      treasury.phases = {
        ...(treasury.phases ?? {}),
        [event.phaseId]: phaseFeesGenerated
      };

      txn.set(item.ref, { isAggregated: true, updatedAt: Date.now() }, { merge: true });
    }
    txn.set(treasuryDoc, treasury, { merge: true });
  });
}
