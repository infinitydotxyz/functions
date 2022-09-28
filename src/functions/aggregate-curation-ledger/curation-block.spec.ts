import {
  ChainId,
  CollectionDisplayData,
  Erc20TokenMetadata,
  InfinityNftSale,
  SaleSource,
  StakeDuration,
  TokenStandard
} from '@infinityxyz/lib/types/core';
import {
  CurationLedgerEvent,
  CurationLedgerSale,
  CurationBlockRewards,
  CurationBlockUsers,
  CurationLedgerVotesAddedWithStake,
  CurationLedgerVotesRemovedWithStake
} from '@infinityxyz/lib/types/core/curation-ledger';
import { FeesGeneratedDto, TradingFeeSplit } from '@infinityxyz/lib/types/dto';
import { ONE_HOUR } from '@infinityxyz/lib/utils';
import { parseEther } from 'ethers/lib/utils';
import { TRADING_FEE_SPLIT_PHASE_1_TO_4 } from '../../rewards/config';
import { formatEth } from '../../utils';
import { CurationBlock } from './curation-block';

const USDC_PER_WETH_PRICE = 2000;
const NFT_PER_USDC_PRICE = 0.07;
const TOKEN_PRICE = NFT_PER_USDC_PRICE / USDC_PER_WETH_PRICE; // NFT per WETH
const COLLECTION = {} as any as CollectionDisplayData;
const TOKEN: Erc20TokenMetadata = {
  address: '0x0',
  chainId: ChainId.Mainnet,
  name: 'Infinity',
  symbol: 'NFT',
  decimals: 18
};

const getFees = (price: number, feePercent = 2.5) => {
  const priceWei = parseEther(price.toString());
  const feeWei = (priceWei.toBigInt() * BigInt(feePercent * 100)) / BigInt(100 * 100);

  const protocolFeeBPS = feePercent * 100;
  const protocolFeeWei = feeWei.toString();
  const protocolFee = formatEth(protocolFeeWei);

  return { protocolFeeBPS, protocolFeeWei, protocolFee, price };
};

const getEventFees = (
  protocolFeeWei: string,
  tradingFeeSplit: TradingFeeSplit
): Pick<FeesGeneratedDto, 'feesGeneratedEth' | 'feesGeneratedWei'> => {
  const curationPercent = tradingFeeSplit.CURATORS.percentage;
  const curationFeeWei = ((BigInt(protocolFeeWei) * BigInt(curationPercent)) / BigInt(100)).toString();

  return {
    feesGeneratedEth: formatEth(curationFeeWei),
    feesGeneratedWei: curationFeeWei
  };
};

const getVotesAddedEvent = (
  userAddress: string,
  votes: number,
  stakePowerPerToken = 1
): CurationLedgerVotesAddedWithStake => {
  return {
    votes,
    userAddress,
    discriminator: CurationLedgerEvent.VotesAdded,
    blockNumber: 1,
    timestamp: Date.now(),
    updatedAt: Date.now(),
    isAggregated: false,
    isDeleted: false,
    collectionAddress: '0x0',
    collectionChainId: ChainId.Mainnet,
    stakerContractAddress: '0x0',
    stakerContractChainId: ChainId.Mainnet,
    isFeedUpdated: false,
    isStakeMerged: true,
    stake: {
      stakeInfo: {} as any,
      stakePower: stakePowerPerToken * votes,
      stakePowerPerToken: stakePowerPerToken,
      stakerEventTxHash: '0x0',
      stakerEventBlockNumber: 0
    },
    tokenContractAddress: '0x0',
    tokenContractChainId: ChainId.Mainnet
  };
};

const getVotesRemovedEvent = (
  userAddress: string,
  votes: number,
  stakePowerPerToken = 1
): CurationLedgerVotesRemovedWithStake => {
  return {
    votes,
    userAddress,
    discriminator: CurationLedgerEvent.VotesRemoved,
    blockNumber: 1,
    timestamp: Date.now(),
    updatedAt: Date.now(),
    isAggregated: false,
    isDeleted: false,
    collectionAddress: '0x0',
    collectionChainId: ChainId.Mainnet,
    stakerContractAddress: '0x0',
    stakerContractChainId: ChainId.Mainnet,
    txHash: '0x0',
    isFeedUpdated: false,
    isStakeMerged: true,
    stake: {
      stakeInfo: {} as any,
      stakePower: stakePowerPerToken * votes,
      stakePowerPerToken: stakePowerPerToken,
      stakerEventTxHash: '0x0',
      stakerEventBlockNumber: 0
    },
    tokenContractAddress: '0x0',
    tokenContractChainId: ChainId.Mainnet
  };
};

const getSaleEvent = (price: number, feePercent: number) => {
  const fees = getFees(price, feePercent);
  const curationFees = getEventFees(fees.protocolFeeWei, TRADING_FEE_SPLIT_PHASE_1_TO_4);
  const sale: InfinityNftSale = {
    source: SaleSource.Infinity,
    ...fees,
    chainId: ChainId.Mainnet,
    txHash: '0x0',
    blockNumber: 1,
    timestamp: Date.now(),
    collectionAddress: '0x0',
    tokenId: '1',
    paymentToken: '0x0',
    buyer: '0x0',
    seller: '0x0',
    quantity: 1,
    tokenStandard: TokenStandard.ERC721,
    isAggregated: false,
    isDeleted: false,
    isFeedUpdated: true
  };
  const saleOne: CurationLedgerSale = {
    ...sale,
    docId: 'saleOne',
    chainId: ChainId.Mainnet,
    discriminator: CurationLedgerEvent.Sale,
    collectionAddress: '0x0',
    collectionChainId: sale.chainId as ChainId,
    stakerContractAddress: '0x0',
    stakerContractChainId: sale.chainId as ChainId,
    updatedAt: Date.now(),
    isStakeMerged: true,
    tokenContractAddress: '0x0',
    tokenContractChainId: ChainId.Mainnet,
    feesGenerated: curationFees as FeesGeneratedDto
  };

  return saleOne;
};

class MockCurationBlock extends CurationBlock {
  addSales(num: number, price: number, feePercent: number) {
    const sale = getSaleEvent(price, feePercent);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _ of new Array(num)) {
      this.addEvent({ ...sale });
    }

    const expectedBlockFeesGeneratedWei = BigInt(sale.feesGenerated.feesGeneratedWei) * BigInt(num);
    return { expectedBlockFeesGeneratedWei };
  }

  public testApplyVoteRemovals(
    users: CurationBlockUsers,
    votesRemoved: CurationLedgerVotesRemovedWithStake[]
  ): { updatedUsers: CurationBlockUsers; usersRemoved: CurationBlockUsers; numCuratorVotesRemoved: number } {
    return this.applyVoteRemovals(users, votesRemoved);
  }

  public testApplyVoteAdditions(
    users: CurationBlockUsers,
    votesAdded: CurationLedgerVotesAddedWithStake[]
  ): { updatedUsers: CurationBlockUsers; newUsers: CurationBlockUsers; numCuratorVotesAdded: number } {
    return this.applyVoteAdditions(users, votesAdded, {} as any);
  }

  public testDistributeRewards(rewards: CurationBlockRewards): CurationBlockRewards {
    return this.distributeRewards(rewards);
  }
}

describe('curation block', () => {
  const blockStart = Date.now() - 1000;

  const defaultPrevBlockRewards: CurationBlockRewards = {
    collection: COLLECTION,
    metadata: {
      collectionAddress: '0x0',
      collectionChainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet,
      tokenContractAddress: '0x0',
      tokenContractChainId: ChainId.Mainnet,
      timestamp: Date.now() - 30000,
      isAggregated: false,
      blockDuration: ONE_HOUR,
      blockNumber: 0
    },
    stats: {
      numCurators: 0,
      numCuratorVotes: 0,
      numCuratorsAdded: 0,
      numCuratorsRemoved: 0,
      numCuratorVotesAdded: 0,
      numCuratorVotesRemoved: 0,
      numCuratorsPercentChange: 0,
      numCuratorVotesPercentChange: 0,
      totalProtocolFeesAccruedWei: '0',
      blockProtocolFeesAccruedWei: '0',
      arbitrageProtocolFeesAccruedWei: '0',
      totalProtocolFeesAccruedEth: 0,
      blockProtocolFeesAccruedEth: 0,
      arbitrageProtocolFeesAccruedEth: 0,
      tokenPrice: 0,
      blockPayoutEth: 0,
      blockPayoutWei: '0',
      blockAprByMultiplier: {
        [StakeDuration.None]: 0,
        [StakeDuration.ThreeMonths]: 0,
        [StakeDuration.SixMonths]: 0,
        [StakeDuration.TwelveMonths]: 0
      },
      avgStakePowerPerToken: 0,
      blockApr: 0,
      totalArbitrageProtocolFeesAccruedWei: '0',
      totalArbitrageProtocolFeesAccruedEth: 0
    },
    users: {}
  };

  it('sums protocol fees to get the total protocol fees for the block', () => {
    const block = new CurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet,
      token: TOKEN
    });
    const sale = getSaleEvent(1, 2.5);
    block.addEvent({ ...sale });
    block.addEvent({ ...sale });
    block.addEvent({ ...sale });
    const expectedFeesGeneratedWei = BigInt(sale.feesGenerated.feesGeneratedWei) * BigInt(3);
    expect(block.feesGeneratedWei).toBe(expectedFeesGeneratedWei.toString());

    const rewards = block.getBlockRewards(defaultPrevBlockRewards, TOKEN_PRICE, COLLECTION);
    expect(rewards.blockRewards.stats.totalProtocolFeesAccruedWei).toBe(expectedFeesGeneratedWei.toString());
    expect(rewards.blockRewards.stats.arbitrageProtocolFeesAccruedWei).toBe(expectedFeesGeneratedWei.toString());
    expect(rewards.blockRewards.stats.blockProtocolFeesAccruedWei).toBe(expectedFeesGeneratedWei.toString());

    const block2 = new CurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet,
      token: TOKEN
    });
    block2.addEvent({ ...sale });
    block2.addEvent({ ...sale });
    block2.addEvent({ ...sale });
    const expectedBlockFeesGeneratedWei = BigInt(sale.feesGenerated.feesGeneratedWei) * BigInt(3);
    const expectedTotalFeesGeneratedWei = BigInt(sale.feesGenerated.feesGeneratedWei) * BigInt(6);

    const rewards2 = block.getBlockRewards(rewards.blockRewards, TOKEN_PRICE, COLLECTION);
    expect(rewards2.blockRewards.stats.totalProtocolFeesAccruedWei).toBe(expectedTotalFeesGeneratedWei.toString());
    expect(rewards2.blockRewards.stats.arbitrageProtocolFeesAccruedWei).toBe(expectedBlockFeesGeneratedWei.toString());
    expect(rewards2.blockRewards.stats.blockProtocolFeesAccruedWei).toBe(expectedBlockFeesGeneratedWei.toString());
  });

  it('adds a user when a new user votes', () => {
    const block = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet,
      token: TOKEN
    });
    const address1 = '0x1';
    const vote1 = getVotesAddedEvent(address1, 1);
    const res = block.testApplyVoteAdditions({}, [vote1]);
    expect(Object.values(res.newUsers).length).toBe(1);
    expect(res.numCuratorVotesAdded).toBe(1);
    expect(Object.values(res.updatedUsers).length).toBe(1);
    const user1 = res.updatedUsers[address1];
    expect(user1).toBeDefined();
    expect(user1.stats.votes).toBe(1);
    expect(user1.stats.totalProtocolFeesAccruedWei).toBe('0');
    expect(user1.stats.blockProtocolFeesAccruedWei).toBe('0');
  });

  it('removes a user when they no longer have votes', () => {
    const block = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet,
      token: TOKEN
    });
    const address = '0x1';
    const vote = getVotesAddedEvent(address, 1);
    const voteResult = block.testApplyVoteAdditions({}, [vote]);
    const user = voteResult.updatedUsers[address];

    expect(user).toBeDefined();
    expect(user.stats.votes).toBe(1);

    const unVote = getVotesRemovedEvent(address, 1);
    const unVoteResult = block.testApplyVoteRemovals(voteResult.updatedUsers, [unVote]);
    expect(unVoteResult.numCuratorVotesRemoved).toBe(1);
    expect(Object.values(unVoteResult.usersRemoved).length).toBe(1);
    const userRemoved = unVoteResult.usersRemoved[address];
    expect(userRemoved).toBeDefined();
    expect(userRemoved.metadata.userAddress).toBe(address);
    expect(Object.values(unVoteResult.updatedUsers).length).toBe(0);
  });

  it('distributes rewards to a single user if they have all of the votes', () => {
    const block = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet,
      token: TOKEN
    });
    const address = '0x1';
    const vote = getVotesAddedEvent(address, 1);
    const sale = getSaleEvent(1, 2.5);
    const expectedBlockFeesGeneratedWei = BigInt(sale.feesGenerated.feesGeneratedWei);

    block.addEvent(vote);
    block.addEvent(sale);

    const { blockRewards, usersAdded, usersRemoved } = block.getBlockRewards(
      defaultPrevBlockRewards,
      TOKEN_PRICE,
      COLLECTION
    );
    expect(Object.values(usersAdded).length).toBe(1);
    expect(Object.values(usersRemoved).length).toBe(0);
    expect(blockRewards.stats.numCuratorVotes).toBe(1);
    const {
      users,
      stats: {
        numCurators,
        numCuratorVotes,
        numCuratorsAdded,
        numCuratorsRemoved,
        numCuratorVotesAdded,
        numCuratorVotesRemoved,
        totalProtocolFeesAccruedWei,
        blockProtocolFeesAccruedWei,
        arbitrageProtocolFeesAccruedWei
      }
    } = blockRewards;

    expect(Object.values(users).length).toBe(1);
    expect(numCurators).toBe(1);
    expect(numCuratorVotes).toBe(1);
    expect(numCuratorsAdded).toBe(1);
    expect(numCuratorsRemoved).toBe(0);
    expect(numCuratorVotesAdded).toBe(1);
    expect(numCuratorVotesRemoved).toBe(0);
    expect(totalProtocolFeesAccruedWei).toBe(expectedBlockFeesGeneratedWei.toString());
    expect(blockProtocolFeesAccruedWei).toBe(expectedBlockFeesGeneratedWei.toString());
    expect(arbitrageProtocolFeesAccruedWei).toBe('0');

    const user = users[address];
    expect(user.stats.blockProtocolFeesAccruedWei).toBe(expectedBlockFeesGeneratedWei.toString());
    expect(user.stats.totalProtocolFeesAccruedWei).toBe(expectedBlockFeesGeneratedWei.toString());
    expect(user.stats.votes).toBe(1);
  });

  it('distributes rewards according to user vote percentage', () => {
    const block = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet,
      token: TOKEN
    });
    const address1 = '0x1';
    const address2 = '0x2';
    const vote1 = getVotesAddedEvent(address1, 1);
    const vote2 = getVotesAddedEvent(address2, 3);
    const sale = getSaleEvent(1, 2.5);
    const expectedBlockFeesGeneratedWei = BigInt(sale.feesGenerated.feesGeneratedWei);

    block.addEvent(vote1);
    block.addEvent(vote2);
    block.addEvent(sale);

    const { blockRewards, usersAdded, usersRemoved } = block.getBlockRewards(
      defaultPrevBlockRewards,
      TOKEN_PRICE,
      COLLECTION
    );
    expect(Object.values(usersAdded).length).toBe(2);
    expect(Object.values(usersRemoved).length).toBe(0);
    expect(blockRewards.stats.numCuratorVotes).toBe(4);
    const {
      users,
      stats: {
        numCurators,
        numCuratorVotes,
        numCuratorsAdded,
        numCuratorsRemoved,
        numCuratorVotesAdded,
        numCuratorVotesRemoved,
        totalProtocolFeesAccruedWei,
        blockProtocolFeesAccruedWei,
        arbitrageProtocolFeesAccruedWei
      }
    } = blockRewards;

    expect(Object.values(users).length).toBe(2);
    expect(numCurators).toBe(2);
    expect(numCuratorVotes).toBe(4);
    expect(numCuratorsAdded).toBe(2);
    expect(numCuratorsRemoved).toBe(0);
    expect(numCuratorVotesAdded).toBe(4);
    expect(numCuratorVotesRemoved).toBe(0);
    expect(totalProtocolFeesAccruedWei).toBe(expectedBlockFeesGeneratedWei.toString());
    expect(blockProtocolFeesAccruedWei).toBe(expectedBlockFeesGeneratedWei.toString());
    expect(arbitrageProtocolFeesAccruedWei).toBe('0');

    const user1 = users[address1];
    const user2 = users[address2];
    const expectedUser1Rewards = expectedBlockFeesGeneratedWei / BigInt(4);
    const expectedUser2Rewards = expectedUser1Rewards * BigInt(3);

    expect(user1.stats.blockProtocolFeesAccruedWei).toBe(expectedUser1Rewards.toString());
    expect(user1.stats.totalProtocolFeesAccruedWei).toBe(expectedUser1Rewards.toString());
    expect(user1.stats.votes).toBe(1);

    expect(user2.stats.blockProtocolFeesAccruedWei).toBe(expectedUser2Rewards.toString());
    expect(user2.stats.totalProtocolFeesAccruedWei).toBe(expectedUser2Rewards.toString());
    expect(user2.stats.votes).toBe(3);
  });

  it('updates total rewards after multiple blocks', () => {
    const block1 = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet,
      token: TOKEN
    });
    const address1 = '0x1';
    const address2 = '0x2';
    const vote1 = getVotesAddedEvent(address1, 1);
    const sale = getSaleEvent(1, 2.5);
    const expectedBlock1FeesGeneratedWei = BigInt(sale.feesGenerated.feesGeneratedWei);

    block1.addEvent(vote1);
    block1.addEvent(sale);

    const {
      blockRewards: block1Rewards,
      usersAdded,
      usersRemoved
    } = block1.getBlockRewards(defaultPrevBlockRewards, TOKEN_PRICE, COLLECTION);
    expect(Object.values(usersAdded).length).toBe(1);
    expect(Object.values(usersRemoved).length).toBe(0);
    expect(block1Rewards.stats.numCuratorVotes).toBe(1);
    const {
      users,
      stats: {
        numCurators,
        numCuratorVotes,
        numCuratorsAdded,
        numCuratorsRemoved,
        numCuratorVotesAdded,
        numCuratorVotesRemoved,
        totalProtocolFeesAccruedWei,
        blockProtocolFeesAccruedWei,
        arbitrageProtocolFeesAccruedWei
      }
    } = block1Rewards;

    expect(Object.values(users).length).toBe(1);
    expect(numCurators).toBe(1);
    expect(numCuratorVotes).toBe(1);
    expect(numCuratorsAdded).toBe(1);
    expect(numCuratorsRemoved).toBe(0);
    expect(numCuratorVotesAdded).toBe(1);
    expect(numCuratorVotesRemoved).toBe(0);
    expect(totalProtocolFeesAccruedWei).toBe(expectedBlock1FeesGeneratedWei.toString());
    expect(blockProtocolFeesAccruedWei).toBe(expectedBlock1FeesGeneratedWei.toString());
    expect(arbitrageProtocolFeesAccruedWei).toBe('0');

    const user1 = users[address1];
    const expectedUser1Rewards = expectedBlock1FeesGeneratedWei;
    expect(user1.stats.blockProtocolFeesAccruedWei).toBe(expectedUser1Rewards.toString());
    expect(user1.stats.totalProtocolFeesAccruedWei).toBe(expectedUser1Rewards.toString());
    expect(user1.stats.votes).toBe(1);

    const block2 = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet,
      token: TOKEN
    });
    const sale2 = getSaleEvent(1, 2.5);
    const expectedBlock2FeesGeneratedWei = BigInt(sale2.feesGenerated.feesGeneratedWei);
    const vote2 = getVotesAddedEvent(address2, 1);
    block2.addEvent(vote2);
    block2.addEvent(sale2);

    const {
      blockRewards: block2Rewards,
      usersAdded: users2Added,
      usersRemoved: users2Removed
    } = block2.getBlockRewards(block1Rewards, TOKEN_PRICE, COLLECTION);

    const expectedBlock2UserRewards = expectedBlock2FeesGeneratedWei / BigInt(2);

    expect(Object.values(users2Added).length).toBe(1);
    expect(Object.values(users2Removed).length).toBe(0);
    expect(Object.values(block2Rewards.users).length).toBe(2);
    expect(block2Rewards.stats.numCurators).toBe(2);
    expect(block2Rewards.stats.numCuratorVotes).toBe(2);
    expect(block2Rewards.stats.numCuratorsAdded).toBe(1);
    expect(block2Rewards.stats.numCuratorsRemoved).toBe(0);
    expect(block2Rewards.stats.numCuratorVotesAdded).toBe(1);
    expect(block2Rewards.stats.numCuratorVotesRemoved).toBe(0);
    expect(block2Rewards.stats.totalProtocolFeesAccruedWei).toBe(
      (expectedBlock1FeesGeneratedWei + expectedBlock2FeesGeneratedWei).toString()
    );
    expect(block2Rewards.stats.blockProtocolFeesAccruedWei).toBe(expectedBlock2FeesGeneratedWei.toString());
    expect(block2Rewards.stats.arbitrageProtocolFeesAccruedWei).toBe('0');

    const user1Block2 = block2Rewards.users[address1];
    const user2Block2 = block2Rewards.users[address2];

    expect(user1Block2.stats.blockProtocolFeesAccruedWei).toBe(expectedBlock2UserRewards.toString());
    expect(user1Block2.stats.totalProtocolFeesAccruedWei).toBe(
      (expectedBlock1FeesGeneratedWei + expectedBlock2UserRewards).toString()
    );
    expect(user1Block2.stats.votes).toBe(1);
    expect(user2Block2.stats.blockProtocolFeesAccruedWei).toBe(expectedBlock2UserRewards.toString());
    expect(user2Block2.stats.totalProtocolFeesAccruedWei).toBe(expectedBlock2UserRewards.toString());
    expect(user2Block2.stats.votes).toBe(1);
  });

  it('tracks total arbitrage protocol fees', () => {
    const block1 = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet,
      token: TOKEN
    });

    const sale = getSaleEvent(1, 2.5);
    const expectedBlock1FeesGeneratedWei = BigInt(sale.feesGenerated.feesGeneratedWei);
    block1.addEvent(sale);

    const {
      blockRewards: block1Rewards,
      usersAdded,
      usersRemoved
    } = block1.getBlockRewards(defaultPrevBlockRewards, TOKEN_PRICE, COLLECTION);
    expect(Object.values(usersAdded).length).toBe(0);
    expect(Object.values(usersRemoved).length).toBe(0);
    expect(block1Rewards.stats.numCuratorVotes).toBe(0);
    const {
      users,
      stats: {
        numCurators,
        numCuratorVotes,
        numCuratorsAdded,
        numCuratorsRemoved,
        numCuratorVotesAdded,
        numCuratorVotesRemoved,
        totalProtocolFeesAccruedWei,
        blockProtocolFeesAccruedWei,
        arbitrageProtocolFeesAccruedWei,
        totalArbitrageProtocolFeesAccruedWei
      }
    } = block1Rewards;

    expect(Object.values(users).length).toBe(0);
    expect(numCurators).toBe(0);
    expect(numCuratorVotes).toBe(0);
    expect(numCuratorsAdded).toBe(0);
    expect(numCuratorsRemoved).toBe(0);
    expect(numCuratorVotesAdded).toBe(0);
    expect(numCuratorVotesRemoved).toBe(0);
    expect(totalProtocolFeesAccruedWei).toBe(expectedBlock1FeesGeneratedWei.toString());
    expect(blockProtocolFeesAccruedWei).toBe(expectedBlock1FeesGeneratedWei.toString());
    expect(arbitrageProtocolFeesAccruedWei).toBe(expectedBlock1FeesGeneratedWei.toString());
    expect(totalArbitrageProtocolFeesAccruedWei).toBe(expectedBlock1FeesGeneratedWei.toString());

    const block2 = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet,
      token: TOKEN
    });
    const address1 = '0x1';
    const vote = getVotesAddedEvent(address1, 1);
    block2.addEvent(vote);
    block2.addEvent(sale);

    const {
      blockRewards: block2Rewards,
      usersAdded: block2UsersAdded,
      usersRemoved: block2UsersRemoved
    } = block2.getBlockRewards(block1Rewards, TOKEN_PRICE, COLLECTION);
    expect(Object.values(block2UsersAdded).length).toBe(1);
    expect(Object.values(block2UsersRemoved).length).toBe(0);
    expect(block2Rewards.stats.numCuratorVotes).toBe(1);

    const expectedBlock2FeesGeneratedWei = BigInt(sale.feesGenerated.feesGeneratedWei);

    expect(Object.values(block2Rewards.users).length).toBe(1);
    expect(block2Rewards.stats.numCurators).toBe(1);
    expect(block2Rewards.stats.numCuratorVotes).toBe(1);
    expect(block2Rewards.stats.numCuratorsAdded).toBe(1);
    expect(block2Rewards.stats.numCuratorsRemoved).toBe(0);
    expect(block2Rewards.stats.numCuratorVotesAdded).toBe(1);
    expect(block2Rewards.stats.numCuratorVotesRemoved).toBe(0);
    expect(block2Rewards.stats.totalProtocolFeesAccruedWei).toBe(
      (expectedBlock1FeesGeneratedWei + expectedBlock2FeesGeneratedWei).toString()
    );
    expect(block2Rewards.stats.blockProtocolFeesAccruedWei).toBe(expectedBlock2FeesGeneratedWei.toString());
    expect(block2Rewards.stats.arbitrageProtocolFeesAccruedWei).toBe('0');

    const user = block2Rewards.users[address1];
    expect(user.stats.blockProtocolFeesAccruedWei).toBe(expectedBlock2FeesGeneratedWei.toString());
    expect(user.stats.totalProtocolFeesAccruedWei).toBe(expectedBlock2FeesGeneratedWei.toString());
    expect(block2Rewards.stats.totalArbitrageProtocolFeesAccruedWei).toBe(
      block1Rewards.stats.arbitrageProtocolFeesAccruedWei
    );
    expect(user.stats.votes).toBe(1);
  });
});
