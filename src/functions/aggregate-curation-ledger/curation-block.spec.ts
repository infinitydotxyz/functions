import { ChainId, InfinityNftSale, SaleSource, TokenStandard } from '@infinityxyz/lib/types/core';
import {
  CurationVotesAdded,
  CurationLedgerEvent,
  CurationVotesRemoved,
  CurationLedgerSale,
  CurationBlockRewards,
  CurationBlockUsers
} from '@infinityxyz/lib/types/core/curation-ledger';
import { parseEther } from 'ethers/lib/utils';
import { formatEth } from '../../utils';
import { CurationBlock } from './curation-block';

const getFees = (price: number, feePercent = 2.5) => {
  const priceWei = parseEther(price.toString());
  const feeWei = (priceWei.toBigInt() * BigInt(feePercent * 100)) / BigInt(100 * 100);

  const protocolFeeBPS = feePercent * 100;
  const protocolFeeWei = feeWei.toString();
  const protocolFee = formatEth(protocolFeeWei);

  return { protocolFeeBPS, protocolFeeWei, protocolFee, price };
};

const getVotesAddedEvent = (userAddress: string, votes: number): CurationVotesAdded => {
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
    stakerContractChainId: ChainId.Mainnet
  };
};

const getVotesRemovedEvent = (userAddress: string, votes: number): CurationVotesRemoved => {
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
    txHash: '0x0'
  };
};

const getSaleEvent = (price: number, feePercent: number) => {
  const sale: InfinityNftSale = {
    source: SaleSource.Infinity,
    ...getFees(price, feePercent),
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
    isDeleted: false
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
    updatedAt: Date.now()
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

    const expectedBlockFeesGeneratedWei = BigInt(sale.protocolFeeWei) * BigInt(num);
    return { expectedBlockFeesGeneratedWei };
  }

  public testApplyVoteRemovals(
    users: CurationBlockUsers,
    votesRemoved: CurationVotesRemoved[]
  ): { updatedUsers: CurationBlockUsers; usersRemoved: CurationBlockUsers; numCuratorVotesRemoved: number } {
    return this.applyVoteRemovals(users, votesRemoved);
  }

  public testApplyVoteAdditions(
    users: CurationBlockUsers,
    votesAdded: CurationVotesAdded[]
  ): { updatedUsers: CurationBlockUsers; newUsers: CurationBlockUsers; numCuratorVotesAdded: number } {
    return this.applyVoteAdditions(users, votesAdded);
  }

  public testDistributeRewards(rewards: CurationBlockRewards): CurationBlockRewards {
    return this.distributeRewards(rewards);
  }
}

describe('curation block', () => {
  const blockStart = Date.now() - 1000;

  const defaultPrevBlockRewards: CurationBlockRewards = {
    collectionAddress: '0x0',
    chainId: ChainId.Mainnet,
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
    timestamp: Date.now() - 30000,
    isAggregated: false,
    users: {},
    stakerContractAddress: '0x0',
    stakerContractChainId: ChainId.Mainnet
  };

  it('sums protocol fees to get the total protocol fees for the block', () => {
    const block = new CurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet
    });
    const sale = getSaleEvent(1, 2.5);
    block.addEvent({ ...sale });
    block.addEvent({ ...sale });
    block.addEvent({ ...sale });
    const expectedFeesGeneratedWei = BigInt(sale.protocolFeeWei) * BigInt(3);
    expect(block.feesGeneratedWei).toBe(expectedFeesGeneratedWei.toString());

    const rewards = block.getBlockRewards(defaultPrevBlockRewards);
    expect(rewards.blockRewards.totalProtocolFeesAccruedWei).toBe(expectedFeesGeneratedWei.toString());
    expect(rewards.blockRewards.arbitrageProtocolFeesAccruedWei).toBe(expectedFeesGeneratedWei.toString());
    expect(rewards.blockRewards.blockProtocolFeesAccruedWei).toBe(expectedFeesGeneratedWei.toString());

    const block2 = new CurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet
    });
    block2.addEvent({ ...sale });
    block2.addEvent({ ...sale });
    block2.addEvent({ ...sale });
    const expectedBlockFeesGeneratedWei = BigInt(sale.protocolFeeWei) * BigInt(3);
    const expectedTotalFeesGeneratedWei = BigInt(sale.protocolFeeWei) * BigInt(6);

    const rewards2 = block.getBlockRewards(rewards.blockRewards);
    expect(rewards2.blockRewards.totalProtocolFeesAccruedWei).toBe(expectedTotalFeesGeneratedWei.toString());
    expect(rewards2.blockRewards.arbitrageProtocolFeesAccruedWei).toBe(expectedTotalFeesGeneratedWei.toString());
    expect(rewards2.blockRewards.blockProtocolFeesAccruedWei).toBe(expectedBlockFeesGeneratedWei.toString());
  });

  it('adds a user when a new user votes', () => {
    const block = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet
    });
    const address1 = '0x1';
    const vote1 = getVotesAddedEvent(address1, 1);
    const res = block.testApplyVoteAdditions({}, [vote1]);
    expect(Object.values(res.newUsers).length).toBe(1);
    expect(res.numCuratorVotesAdded).toBe(1);
    expect(Object.values(res.updatedUsers).length).toBe(1);
    const user1 = res.updatedUsers[address1];
    expect(user1).toBeDefined();
    expect(user1.votes).toBe(1);
    expect(user1.totalProtocolFeesAccruedWei).toBe('0');
    expect(user1.blockProtocolFeesAccruedWei).toBe('0');
  });

  it('removes a user when they no longer have votes', () => {
    const block = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet
    });
    const address = '0x1';
    const vote = getVotesAddedEvent(address, 1);
    const voteResult = block.testApplyVoteAdditions({}, [vote]);
    const user = voteResult.updatedUsers[address];

    expect(user).toBeDefined();
    expect(user.votes).toBe(1);

    const unVote = getVotesRemovedEvent(address, 1);
    const unVoteResult = block.testApplyVoteRemovals(voteResult.updatedUsers, [unVote]);
    expect(unVoteResult.numCuratorVotesRemoved).toBe(1);
    expect(Object.values(unVoteResult.usersRemoved).length).toBe(1);
    const userRemoved = unVoteResult.usersRemoved[address];
    expect(userRemoved).toBeDefined();
    expect(userRemoved.userAddress).toBe(address);
    expect(Object.values(unVoteResult.updatedUsers).length).toBe(0);
  });

  it('distributes rewards to a single user if they have all of the votes', () => {
    const block = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet
    });
    const address = '0x1';
    const vote = getVotesAddedEvent(address, 1);
    const sale = getSaleEvent(1, 2.5);
    const expectedBlockFeesGeneratedWei = BigInt(sale.protocolFeeWei);

    block.addEvent(vote);
    block.addEvent(sale);

    const { blockRewards, usersAdded, usersRemoved } = block.getBlockRewards(defaultPrevBlockRewards);
    expect(Object.values(usersAdded).length).toBe(1);
    expect(Object.values(usersRemoved).length).toBe(0);
    expect(blockRewards.numCuratorVotes).toBe(1);
    const {
      users,
      numCurators,
      numCuratorVotes,
      numCuratorsAdded,
      numCuratorsRemoved,
      numCuratorVotesAdded,
      numCuratorVotesRemoved,
      totalProtocolFeesAccruedWei,
      blockProtocolFeesAccruedWei,
      arbitrageProtocolFeesAccruedWei
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
    expect(user.blockProtocolFeesAccruedWei).toBe(expectedBlockFeesGeneratedWei.toString());
    expect(user.totalProtocolFeesAccruedWei).toBe(expectedBlockFeesGeneratedWei.toString());
    expect(user.votes).toBe(1);
  });

  it('distributes rewards according to user vote percentage', () => {
    const block = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet
    });
    const address1 = '0x1';
    const address2 = '0x2';
    const vote1 = getVotesAddedEvent(address1, 1);
    const vote2 = getVotesAddedEvent(address2, 3);
    const sale = getSaleEvent(1, 2.5);
    const expectedBlockFeesGeneratedWei = BigInt(sale.protocolFeeWei);

    block.addEvent(vote1);
    block.addEvent(vote2);
    block.addEvent(sale);

    const { blockRewards, usersAdded, usersRemoved } = block.getBlockRewards(defaultPrevBlockRewards);
    expect(Object.values(usersAdded).length).toBe(2);
    expect(Object.values(usersRemoved).length).toBe(0);
    expect(blockRewards.numCuratorVotes).toBe(4);
    const {
      users,
      numCurators,
      numCuratorVotes,
      numCuratorsAdded,
      numCuratorsRemoved,
      numCuratorVotesAdded,
      numCuratorVotesRemoved,
      totalProtocolFeesAccruedWei,
      blockProtocolFeesAccruedWei,
      arbitrageProtocolFeesAccruedWei
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

    expect(user1.blockProtocolFeesAccruedWei).toBe(expectedUser1Rewards.toString());
    expect(user1.totalProtocolFeesAccruedWei).toBe(expectedUser1Rewards.toString());
    expect(user1.votes).toBe(1);

    expect(user2.blockProtocolFeesAccruedWei).toBe(expectedUser2Rewards.toString());
    expect(user2.totalProtocolFeesAccruedWei).toBe(expectedUser2Rewards.toString());
    expect(user2.votes).toBe(3);
  });

  it('updates total rewards after multiple blocks', () => {
    const block1 = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet
    });
    const address1 = '0x1';
    const address2 = '0x2';
    const vote1 = getVotesAddedEvent(address1, 1);
    const sale = getSaleEvent(1, 2.5);
    const expectedBlock1FeesGeneratedWei = BigInt(sale.protocolFeeWei);

    block1.addEvent(vote1);
    block1.addEvent(sale);

    const { blockRewards: block1Rewards, usersAdded, usersRemoved } = block1.getBlockRewards(defaultPrevBlockRewards);
    expect(Object.values(usersAdded).length).toBe(1);
    expect(Object.values(usersRemoved).length).toBe(0);
    expect(block1Rewards.numCuratorVotes).toBe(1);
    const {
      users,
      numCurators,
      numCuratorVotes,
      numCuratorsAdded,
      numCuratorsRemoved,
      numCuratorVotesAdded,
      numCuratorVotesRemoved,
      totalProtocolFeesAccruedWei,
      blockProtocolFeesAccruedWei,
      arbitrageProtocolFeesAccruedWei
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
    expect(user1.blockProtocolFeesAccruedWei).toBe(expectedUser1Rewards.toString());
    expect(user1.totalProtocolFeesAccruedWei).toBe(expectedUser1Rewards.toString());
    expect(user1.votes).toBe(1);

    const block2 = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet
    });
    const sale2 = getSaleEvent(1, 2.5);
    const expectedBlock2FeesGeneratedWei = BigInt(sale2.protocolFeeWei);
    const vote2 = getVotesAddedEvent(address2, 1);
    block2.addEvent(vote2);
    block2.addEvent(sale2);

    const {
      blockRewards: block2Rewards,
      usersAdded: users2Added,
      usersRemoved: users2Removed
    } = block2.getBlockRewards(block1Rewards);

    const expectedBlock2UserRewards = expectedBlock2FeesGeneratedWei / BigInt(2);

    expect(Object.values(users2Added).length).toBe(1);
    expect(Object.values(users2Removed).length).toBe(0);
    expect(Object.values(block2Rewards.users).length).toBe(2);
    expect(block2Rewards.numCurators).toBe(2);
    expect(block2Rewards.numCuratorVotes).toBe(2);
    expect(block2Rewards.numCuratorsAdded).toBe(1);
    expect(block2Rewards.numCuratorsRemoved).toBe(0);
    expect(block2Rewards.numCuratorVotesAdded).toBe(1);
    expect(block2Rewards.numCuratorVotesRemoved).toBe(0);
    expect(block2Rewards.totalProtocolFeesAccruedWei).toBe(
      (expectedBlock1FeesGeneratedWei + expectedBlock2FeesGeneratedWei).toString()
    );
    expect(block2Rewards.blockProtocolFeesAccruedWei).toBe(expectedBlock2FeesGeneratedWei.toString());
    expect(block2Rewards.arbitrageProtocolFeesAccruedWei).toBe('0');

    const user1Block2 = block2Rewards.users[address1];
    const user2Block2 = block2Rewards.users[address2];

    expect(user1Block2.blockProtocolFeesAccruedWei).toBe(expectedBlock2UserRewards.toString());
    expect(user1Block2.totalProtocolFeesAccruedWei).toBe(
      (expectedBlock1FeesGeneratedWei + expectedBlock2UserRewards).toString()
    );
    expect(user1Block2.votes).toBe(1);
    expect(user2Block2.blockProtocolFeesAccruedWei).toBe(expectedBlock2UserRewards.toString());
    expect(user2Block2.totalProtocolFeesAccruedWei).toBe(expectedBlock2UserRewards.toString());
    expect(user2Block2.votes).toBe(1);
  });

  it('carries over arbitrage protocol fees until votes are added', () => {
    const block1 = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet
    });

    const sale = getSaleEvent(1, 2.5);
    const expectedBlock1FeesGeneratedWei = BigInt(sale.protocolFeeWei);
    block1.addEvent(sale);

    const { blockRewards: block1Rewards, usersAdded, usersRemoved } = block1.getBlockRewards(defaultPrevBlockRewards);
    expect(Object.values(usersAdded).length).toBe(0);
    expect(Object.values(usersRemoved).length).toBe(0);
    expect(block1Rewards.numCuratorVotes).toBe(0);
    const {
      users,
      numCurators,
      numCuratorVotes,
      numCuratorsAdded,
      numCuratorsRemoved,
      numCuratorVotesAdded,
      numCuratorVotesRemoved,
      totalProtocolFeesAccruedWei,
      blockProtocolFeesAccruedWei,
      arbitrageProtocolFeesAccruedWei
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

    const block2 = new MockCurationBlock({
      blockStart,
      collectionAddress: '0x0',
      chainId: ChainId.Mainnet,
      stakerContractAddress: '0x0',
      stakerContractChainId: ChainId.Mainnet
    });
    const address1 = '0x1';
    const vote = getVotesAddedEvent(address1, 1);
    block2.addEvent(vote);
    block2.addEvent(sale);

    const {
      blockRewards: block2Rewards,
      usersAdded: block2UsersAdded,
      usersRemoved: block2UsersRemoved
    } = block2.getBlockRewards(block1Rewards);
    expect(Object.values(block2UsersAdded).length).toBe(1);
    expect(Object.values(block2UsersRemoved).length).toBe(0);
    expect(block2Rewards.numCuratorVotes).toBe(1);

    const arbitrageFeesFromBlock1 = expectedBlock1FeesGeneratedWei;
    const expectedBlock2FeesGeneratedWei = BigInt(sale.protocolFeeWei);

    expect(Object.values(block2Rewards.users).length).toBe(1);
    expect(block2Rewards.numCurators).toBe(1);
    expect(block2Rewards.numCuratorVotes).toBe(1);
    expect(block2Rewards.numCuratorsAdded).toBe(1);
    expect(block2Rewards.numCuratorsRemoved).toBe(0);
    expect(block2Rewards.numCuratorVotesAdded).toBe(1);
    expect(block2Rewards.numCuratorVotesRemoved).toBe(0);
    expect(block2Rewards.totalProtocolFeesAccruedWei).toBe(
      (expectedBlock1FeesGeneratedWei + expectedBlock2FeesGeneratedWei).toString()
    );
    expect(block2Rewards.blockProtocolFeesAccruedWei).toBe(expectedBlock2FeesGeneratedWei.toString());
    expect(block2Rewards.arbitrageProtocolFeesAccruedWei).toBe('0');

    const user = block2Rewards.users[address1];
    expect(user.blockProtocolFeesAccruedWei).toBe(
      (expectedBlock2FeesGeneratedWei + arbitrageFeesFromBlock1).toString()
    );
    expect(user.totalProtocolFeesAccruedWei).toBe(
      (expectedBlock2FeesGeneratedWei + arbitrageFeesFromBlock1).toString()
    );
    expect(user.votes).toBe(1);
  });
});
