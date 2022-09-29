import { ChainId } from '@infinityxyz/lib/types/core';
import { formatEth } from '@infinityxyz/lib/utils';
import { paginatedTransaction } from '../../firestore/paginated-transaction';
import { TreasuryBalanceAddedEvent } from '../../rewards/trading-fee-program-handlers/treasury-handler';
import { TreasuryDoc } from './types';

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
        feesGenerated: {
          feesGeneratedWei: '0',
          feesGeneratedEth: 0,
        },
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
