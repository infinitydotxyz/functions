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

  /**
   * total fees accrued over all previous blocks
   * and this block 
   */
  totalProtocolFeesAccruedWei: string;

  /**
   * fees accrued during this block
   */
  blockProtocolFeesAccruedWei: string;

  /**
   * arbitrage fees that are left over from previous blocks
   */
  arbitrageProtocolFeesAccruedWei: string;

  totalProtocolFeesAccruedEth: number;
  blockProtocolFeesAccruedEth: number;
  arbitrageProtocolFeesAccruedEth: number;

  /**
   * start timestamp of the block
   */
  timestamp: number;
}

export interface CurationBlockRewards extends CurationBlockRewardsDoc {
  users: CurationUsers;
}

export interface CurationMetadata {
  ledgerRequiresAggregation: boolean;
  updatedAt: number;
}
