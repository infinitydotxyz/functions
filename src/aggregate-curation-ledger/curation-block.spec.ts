import { ChainId, InfinityNftSale, SaleSource, TokenStandard } from '@infinityxyz/lib/types/core';
import { parseEther } from 'ethers/lib/utils';
import { CurationLedgerEvent, CurationLedgerSale } from '../aggregate-sales-stats/curation.types';
import { formatEth } from '../utils';
import { CurationBlock } from './curation-block';
import { CurationBlockRewards } from './types';

const getFees = (price: number, feePercent = 2.5) => {
  const priceWei = parseEther(price.toString());
  const feeWei = (priceWei.toBigInt() * BigInt(feePercent * 100)) / BigInt(100 * 100);

  const protocolFeeBPS = feePercent * 100;
  const protocolFeeWei = feeWei.toString();
  const protocolFee = formatEth(protocolFeeWei);

  return { protocolFeeBPS, protocolFeeWei, protocolFee, price };
};

describe('curation block', () => {
  const blockStart = Date.now() - 1000;
  const sale: InfinityNftSale = {
    source: SaleSource.Infinity,
    ...getFees(1), // 1 ETH
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
    address: '0x0',
    isAggregated: false,
    isDeleted: false,
    updatedAt: Date.now()
  };

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
    timestamp: Date.now() - 30_000,
    isAggregated: false,
    users: {}
  };

  it('sums protocol fees to get the total protocol fees for the block', () => {
    const block = new CurationBlock({ blockStart, collectionAddress: '0x0', chainId: ChainId.Mainnet });
    block.addEvent({ ...saleOne });
    block.addEvent({ ...saleOne });
    block.addEvent({ ...saleOne });
    const expectedFeesGeneratedWei = BigInt(saleOne.protocolFeeWei) * BigInt(3);
    expect(block.feesGeneratedWei).toBe(expectedFeesGeneratedWei.toString());

    const rewards = block.getBlockRewards(defaultPrevBlockRewards);
    expect(rewards.blockRewards.totalProtocolFeesAccruedWei).toBe(expectedFeesGeneratedWei.toString());
    expect(rewards.blockRewards.arbitrageProtocolFeesAccruedWei).toBe(expectedFeesGeneratedWei.toString());
    expect(rewards.blockRewards.blockProtocolFeesAccruedWei).toBe(expectedFeesGeneratedWei.toString());

    const block2 = new CurationBlock({ blockStart, collectionAddress: '0x0', chainId: ChainId.Mainnet });
    block2.addEvent({ ...saleOne });
    block2.addEvent({ ...saleOne });
    block2.addEvent({ ...saleOne });
    const expectedBlockFeesGeneratedWei = BigInt(saleOne.protocolFeeWei) * BigInt(3);
    const expectedTotalFeesGeneratedWei = BigInt(saleOne.protocolFeeWei) * BigInt(6);

    const rewards2 = block.getBlockRewards(rewards.blockRewards);
    expect(rewards2.blockRewards.totalProtocolFeesAccruedWei).toBe(expectedTotalFeesGeneratedWei.toString());
    expect(rewards2.blockRewards.arbitrageProtocolFeesAccruedWei).toBe(expectedTotalFeesGeneratedWei.toString());
    expect(rewards2.blockRewards.blockProtocolFeesAccruedWei).toBe(expectedBlockFeesGeneratedWei.toString());
  });
});
