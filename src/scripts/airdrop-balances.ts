import { BigNumber, BigNumberish, ethers } from 'ethers';

import { InfinityStakerABI, ERC20ABI } from '@infinityxyz/lib/abi';
import { ChainId } from '@infinityxyz/lib/types/core';
import { getFlurTokenAddress, trimLowerCase } from '@infinityxyz/lib/utils';

import { getDb } from '@/firestore/db';
import { Erc20TransferEvent } from '@/lib/on-chain-events/erc20/erc20-transfer';
import { getProvider } from '@/lib/utils/ethersUtils';

const block = 17090175;

export async function getFlurBalances() {
  const chainId = ChainId.Mainnet;
  const flurContract = '0xdae65e3c3933e1552c3d7fe1b585af33228a8840';

  const provider = getProvider(chainId);

  const contract = new ethers.Contract(flurContract, ERC20ABI, provider);
  const db = getDb();
  const erc20Transfer = new Erc20TransferEvent(chainId, contract, flurContract, db);

  let transferLogs = await provider.getLogs({
    ...erc20Transfer.eventFilter,
    fromBlock: 0,
    toBlock: block
  });

  let transfers = transferLogs.map((item) => erc20Transfer.transformEvent({ log: item, baseParams: {} as any }));

  console.log(`Found ${transfers.length} FLUR transfer events`);

  let uniqueAddresses = new Set<string>();

  for (const transfer of transfers) {
    uniqueAddresses.add(transfer.from);
    uniqueAddresses.add(transfer.to);
  }

  console.log(`Found ${uniqueAddresses.size} unique addresses for FLUR transfers`);

  let balances: { [address: string]: BigNumberish } = {};

  let totalSupply = BigNumber.from(0);
  for (const address of uniqueAddresses) {
    if (address !== ethers.constants.AddressZero) {
      let balanceAtBlock = await contract.balanceOf(address, { blockTag: block });
      console.log(`User ${address} has ${balanceAtBlock} FLUR`);
      balances[address] = balanceAtBlock;
      totalSupply = totalSupply.add(balanceAtBlock);
    }
  }

  return {
    balances,
    totalSupply
  };
}

export async function getINFTBalances() {
  const chainId = ChainId.Mainnet;
  const inftContract = '0xbAdA557cdFA4f5a45bf7fed3cBb40Db567f9E9Ad';
  const stakerAddress = '0xBAda55fA5FF3850fC979455F27F0cA3f1178Be55'.toLowerCase();

  const provider = getProvider(chainId);

  const contract = new ethers.Contract(inftContract, ERC20ABI, provider);
  const stakerContract = new ethers.Contract(stakerAddress, InfinityStakerABI, provider);
  const db = getDb();
  const erc20Transfer = new Erc20TransferEvent(chainId, contract, inftContract, db);

  let transferLogs = await provider.getLogs({
    ...erc20Transfer.eventFilter,
    fromBlock: 0,
    toBlock: block
  });

  let transfers = transferLogs.map((item) => erc20Transfer.transformEvent({ log: item, baseParams: {} as any }));

  console.log(`Found ${transfers.length} INFT transfer events`);

  let uniqueAddresses = new Set<string>();

  for (const transfer of transfers) {
    uniqueAddresses.add(transfer.from);
    uniqueAddresses.add(transfer.to);
  }

  console.log(`Found ${uniqueAddresses.size} unique addresses for INFT transfers`);

  let balances: { [address: string]: BigNumberish } = {};

  let totalSupply = BigNumber.from(0);
  for (const address of uniqueAddresses) {
    if (address !== ethers.constants.AddressZero && address !== stakerAddress) {
      let balanceAtBlock = await contract.balanceOf(address, { blockTag: block });
      let amountStakedAtBlock = await stakerContract.getUserTotalStaked(address, { blockTag: block });
      console.log(`User ${address} has ${balanceAtBlock} INFT and ${amountStakedAtBlock} staked`);
      balances[address] = BigNumber.from(balanceAtBlock).add(amountStakedAtBlock);
      totalSupply = totalSupply.add(balanceAtBlock).add(amountStakedAtBlock);
    }
  }

  return {
    balances,
    totalSupply
  };
}

async function main() {
  let flurBalances = await getFlurBalances();

  let inftBalances = await getINFTBalances();
  console.log(`FLUR total supply: ${flurBalances.totalSupply} ${Object.keys(flurBalances.balances).length} owners`);
  console.log(`INFT total supply: ${inftBalances.totalSupply} ${Object.keys(inftBalances.balances).length} owners`);
  process.exit(1);
}

void main();
