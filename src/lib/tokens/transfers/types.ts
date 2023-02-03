import { NftSaleEventV2 } from 'functions/aggregate-sales-stats/types';

import { ChainId } from '@infinityxyz/lib/types/core';

import { FlaggedTokenEvent } from '@/lib/reservoir/api/tokens/types';

export enum NftEventKind {
  Transfer = 'transfer',
  Sale = 'sale',
  FlagStatus = 'flag-status'
}

interface NftEvent {
  metadata: {
    kind: NftEventKind;
    processed: boolean;
    timestamp: number;
    chainId: ChainId;
    address: string;
    tokenId: string;
  };
}

interface OnChainNftEventData {
  blockNumber: number;
  blockHash: string;
  blockTimestamp: number;

  transactionHash: string;
  transactionIndex: number;

  logIndex: number;

  removed: boolean;

  topics: string[];
  data: string;
}

interface OnChainNftEvent extends NftEvent {
  metadata: NftEvent['metadata'] & {
    commitment: 'latest' | 'safe' | 'finalized';
  };
  data: OnChainNftEventData;
}

interface OnChainNftTransferEventData extends OnChainNftEventData {
  isMint: boolean;

  from: string;
  to: string;
}

export interface NftTransferEvent extends OnChainNftEvent {
  metadata: OnChainNftEvent['metadata'] & { kind: NftEventKind.Transfer };
  data: OnChainNftTransferEventData;
}

export interface NftSaleEvent extends NftEvent {
  metadata: NftEvent['metadata'] & { kind: NftEventKind.Sale };
  data: NftSaleEventV2;
}

export interface NftFlagStatusEvent extends NftEvent {
  metadata: NftEvent['metadata'] & { kind: NftEventKind.FlagStatus };
  data: FlaggedTokenEvent;
}

export type NftEvents = NftTransferEvent | NftSaleEvent | NftFlagStatusEvent;
