export interface CurationUser {
  userAddress: string;
  votes: number;
  totalProtocolFeesAccruedWei: string;
  blockProtocolFeesAccruedWei: string;
}

export type CurationUsers = { [userAddress: string]: CurationUser };

export interface CurationBlockRewardsDoc {
  numCurators: number;
  numCuratorVotes: number;
  totalProtocolFeesAccruedWei: string;
  blockProtocolFeesAccruedWei: string;
  startTimestamp: number;
}

export interface CurationBlockRewards extends CurationBlockRewardsDoc {
  users: CurationUsers;
}

export interface CurationMetadata {
    ledgerRequiresAggregation: boolean;
    updatedAt: number;
}