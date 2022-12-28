import { ChainId, Collection, CurationLedgerEvents } from '@infinityxyz/lib/types/core';
import { ONE_MIN, getTokenByStaker } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';

import { CurationMetadata } from './types';

/**
 * triggers curation aggregation if the curation metadata doc has not been updated within the last 2 min
 */
export async function triggerCurationAggregation(
  curationLedgerEventRef: FirebaseFirestore.DocumentReference<CurationLedgerEvents>,
  batchHandler?: BatchHandler
) {
  const stakerContractMetadataRef = curationLedgerEventRef.parent
    .parent as FirebaseFirestore.DocumentReference<CurationMetadata>;
  const collectionRef = stakerContractMetadataRef.parent.parent as FirebaseFirestore.DocumentReference<Collection>;

  const [collectionChainId, collectionAddress] = collectionRef.id.split(':') as [ChainId, string];
  const [stakerContractChainId, stakerContractAddress] = stakerContractMetadataRef.id.split(':') as [ChainId, string];

  const token = getTokenByStaker(stakerContractChainId, stakerContractAddress);
  const stakerContractMetadataSnap = await stakerContractMetadataRef.get();
  const stakerContractMetadata = stakerContractMetadataSnap.data();
  const minAge = ONE_MIN;
  if (!stakerContractMetadata || stakerContractMetadata.updatedAt <= Date.now() - minAge) {
    const curationMetadataUpdate: Omit<
      CurationMetadata,
      'refreshCurrentSnippetBy' | 'currentSnippetRequiresAggregation' | 'periodsRequireAggregation'
    > = {
      updatedAt: Date.now(),
      ledgerRequiresAggregation: true,
      collectionAddress,
      collectionChainId,
      stakerContractAddress,
      stakerContractChainId,
      token
    };
    if (batchHandler) {
      await batchHandler.addAsync(stakerContractMetadataRef, curationMetadataUpdate, { merge: true });
    } else {
      await stakerContractMetadataRef.set(curationMetadataUpdate, { merge: true });
    }
  }
}
