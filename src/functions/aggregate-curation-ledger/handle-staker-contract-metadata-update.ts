import { ChainId, Collection } from '@infinityxyz/lib/types/core';
import { getCollectionDisplayData } from '../../utils';
import { aggregateLedger } from './aggregate-ledger';
import { aggregateBlocks } from './aggregate-periods';
import { CurationBlockAggregator } from './curation-block-aggregator';
import { CurationPeriodAggregator } from './curation-period-aggregator';
import { CurationMetadata } from './types';
import {
  getCurrentBlocks,
  getCurrentCurationSnippet,
  getCurrentPeriods,
  saveCurrentCurationSnippet
} from './update-current-curation-snippet';

export async function handlerStakerContractMetadata(
  stakerContractMetadataRef: FirebaseFirestore.DocumentReference<CurationMetadata>,
  stakerContractMetadata: CurationMetadata
) {
  const [stakerContractChainId, stakerContractAddress] = stakerContractMetadataRef.id.split(':') as [ChainId, string];
  const collectionRef = stakerContractMetadataRef.parent.parent as FirebaseFirestore.DocumentReference<Collection>;
  const [collectionChainId, collectionAddress] = collectionRef.id.split(':') as [ChainId, string];

  if (stakerContractMetadata.ledgerRequiresAggregation) {
    await aggregateLedger(
      stakerContractMetadataRef,
      collectionAddress,
      collectionChainId,
      stakerContractAddress,
      stakerContractChainId,
      stakerContractMetadata.token
    );
    const updatedAt = Date.now();
    const triggerPeriodAggregationUpdate: Partial<CurationMetadata> = {
      ledgerRequiresAggregation: false,
      updatedAt,
      periodsRequireAggregation: true,
      collectionAddress,
      collectionChainId,
      stakerContractAddress,
      stakerContractChainId,
      token: stakerContractMetadata.token
    };
    stakerContractMetadata = { ...stakerContractMetadata, ...triggerPeriodAggregationUpdate };
    await stakerContractMetadataRef.set(stakerContractMetadata, { merge: true });
  }

  if (stakerContractMetadata.periodsRequireAggregation) {
    const collection = await getCollectionDisplayData(
      stakerContractMetadataRef.firestore,
      collectionAddress,
      collectionChainId
    );
    await aggregateBlocks(
      stakerContractMetadataRef,
      collectionAddress,
      collectionChainId,
      stakerContractAddress,
      stakerContractChainId,
      stakerContractMetadata.token,
      collection
    );
    const metadataUpdate: Partial<CurationMetadata> = {
      periodsRequireAggregation: false,
      currentSnippetRequiresAggregation: true,
      updatedAt: Date.now()
    };
    stakerContractMetadata = { ...stakerContractMetadata, ...metadataUpdate };
    await stakerContractMetadataRef.set(stakerContractMetadata, { merge: true });
  }

  if (stakerContractMetadata.currentSnippetRequiresAggregation) {
    const currentBlocks = await getCurrentBlocks(stakerContractMetadataRef);
    const currentPeriods = await getCurrentPeriods(stakerContractMetadataRef);
    const collection = await getCollectionDisplayData(
      stakerContractMetadataRef.firestore,
      collectionAddress,
      collectionChainId
    );
    const currentSnippet = getCurrentCurationSnippet(
      currentPeriods,
      currentBlocks,
      stakerContractAddress,
      stakerContractChainId,
      stakerContractMetadata.token,
      collectionAddress,
      collectionChainId,
      collection
    );
    const currentBlockExpiresAt = currentBlocks.current?.metadata?.timestamp
      ? CurationBlockAggregator.getCurationBlockRange(currentBlocks.current?.metadata?.timestamp).endTimestamp
      : null;
    const currentPeriodExpiresAt = currentPeriods.current?.metadata?.timestamp
      ? CurationPeriodAggregator.getCurationPeriodRange(currentPeriods.current?.metadata?.timestamp).endTimestamp
      : null;
    const refreshCurrentSnippetBy =
      currentBlockExpiresAt ?? currentPeriodExpiresAt ?? Date.now() + CurationPeriodAggregator.DURATION;
    await saveCurrentCurationSnippet(currentSnippet, stakerContractMetadataRef);
    const metadataUpdate: Partial<CurationMetadata> = {
      currentSnippetRequiresAggregation: false,
      updatedAt: Date.now(),
      refreshCurrentSnippetBy
    };
    stakerContractMetadata = { ...stakerContractMetadata, ...metadataUpdate };
    await stakerContractMetadataRef.set(stakerContractMetadata, { merge: true });
  }
}