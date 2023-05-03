import { BigNumber, BigNumberish, ethers } from 'ethers';
import { parseEther } from 'ethers/lib/utils';
import { readFile, writeFile } from 'fs/promises';
import 'module-alias/register';
import PQueue from 'p-queue';
import { join } from 'path';

import { InfinityStakerABI, ERC20ABI } from '@infinityxyz/lib/abi';
import { ChainId } from '@infinityxyz/lib/types/core';
import { sleep, trimLowerCase } from '@infinityxyz/lib/utils';

import { BatchHandler } from '@/firestore/batch-handler';
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
  let cmDistributor = '0xf1000a7467e9d67f53e44ab30562800b6e38f616';
  const adi = trimLowerCase('0xDBd8277e2E16aa40f0e5D3f21ffe600Ad706D979');
  const uniswapV3Staker = trimLowerCase('0xe34139463bA50bD61336E0c446Bd8C0867c6fE65');
  const uniswapV3Flur = trimLowerCase('0x4EE0E3e9DED1EEA97e91490a12FeC39fe99C102f');
  let totalSupply = BigNumber.from(0);
  let totalSupplyIncluded = BigNumber.from(0);

  const queue = new PQueue({ concurrency: 10 });
  for (const address of uniqueAddresses) {
    queue
      .add(async () => {
        let attempts = 0;
        while (true) {
          attempts += 1;
          try {
            if (
              address === cmDistributor ||
              address === adi ||
              address === uniswapV3Staker ||
              address === uniswapV3Flur
            ) {
              let balanceAtBlock = await contract.balanceOf(address, { blockTag: block });
              totalSupply = totalSupply.add(balanceAtBlock);
            } else if (address !== ethers.constants.AddressZero) {
              let balanceAtBlock = await contract.balanceOf(address, { blockTag: block });
              console.log(`User ${address} has ${balanceAtBlock} FLUR`);
              balances[address] = balanceAtBlock;
              totalSupply = totalSupply.add(balanceAtBlock);
              totalSupplyIncluded = totalSupplyIncluded.add(balanceAtBlock);
            }
            return;
          } catch (err) {
            if (attempts > 3) {
              throw err;
            }

            await sleep(1000);
          }
        }
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }

  await queue.onIdle();

  let topBalances = Object.entries(balances)
    .sort(([addrA, balanceA], [addrB, balanceB]) => (BigNumber.from(balanceB).sub(balanceA).gt(0) ? 1 : -1))
    .slice(0, 10);

  console.log('Top 10 FLUR balances:');
  console.table(topBalances);

  return {
    balances,
    totalSupply,
    totalSupplyIncluded
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

  let multiSig = '0xb81819ef1e84f04b6eb7ad210677936688ba3123';
  let cmDistributor = '0xbada55c9c42e573047c76eb65e29d853f7b77b9c';

  let totalSupply = BigNumber.from(0);
  let totalSupplyIncluded = BigNumber.from(0);
  const queue = new PQueue({ concurrency: 10 });
  for (const address of uniqueAddresses) {
    queue
      .add(async () => {
        let attempts = 0;
        while (true) {
          attempts += 1;
          try {
            if (address === multiSig || address === cmDistributor) {
              let balanceAtBlock = await contract.balanceOf(address, { blockTag: block });
              let amountStakedAtBlock = await stakerContract.getUserTotalStaked(address, { blockTag: block });
              totalSupply = totalSupply.add(balanceAtBlock).add(amountStakedAtBlock);
            } else if (address !== ethers.constants.AddressZero && address !== stakerAddress) {
              let balanceAtBlock = await contract.balanceOf(address, { blockTag: block });
              let amountStakedAtBlock = await stakerContract.getUserTotalStaked(address, { blockTag: block });
              console.log(`User ${address} has ${balanceAtBlock} INFT and ${amountStakedAtBlock} staked`);
              balances[address] = BigNumber.from(balanceAtBlock).add(amountStakedAtBlock);
              totalSupply = totalSupply.add(balanceAtBlock).add(amountStakedAtBlock);
              totalSupplyIncluded = totalSupplyIncluded.add(balanceAtBlock).add(amountStakedAtBlock);
            }
            return;
          } catch (err) {
            if (attempts > 3) {
              throw err;
            }

            await sleep(1000);
          }
        }
      })
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }

  await queue.onIdle();

  let topBalances = Object.entries(balances)
    .sort(([addrA, balanceA], [addrB, balanceB]) => (BigNumber.from(balanceB).sub(balanceA).gt(0) ? 1 : -1))
    .slice(0, 10);

  console.log('Top 10 INFT balances:');
  console.table(topBalances);

  return {
    balances,
    totalSupply,
    totalSupplyIncluded
  };
}

async function getOpenSeaAndBlurBuyers() {
  const file = './blur-opensea-buyers.csv';
  const data = await readFile(file, 'utf-8');

  let lines = data.split('\n');

  let buyers: { [address: string]: { volumeUSD: number } } = {};

  for (const line of lines) {
    let parts = line.trim().split(',');
    const address = trimLowerCase(parts[0] ?? '');
    const volumeUSD = Math.floor(parseFloat(parts[1] ?? ''));

    if (!address || !volumeUSD) {
      continue;
    }

    let normalizedAddress = trimLowerCase(address);
    if (!ethers.utils.isAddress(normalizedAddress)) {
      throw new Error(`invalid address ${normalizedAddress}`);
    } else if (typeof volumeUSD !== 'number') {
      throw new Error('invalid volumeUSD');
    }

    buyers[normalizedAddress] = {
      volumeUSD: volumeUSD
    };
  }

  return buyers;
}

async function main() {
  try {
    let [buyers, flurBalances, inftBalances] = await Promise.all([
      getOpenSeaAndBlurBuyers(),
      getFlurBalances(),
      getINFTBalances()
    ]);

    console.log(`Found ${Object.keys(buyers).length} OpenSea/Blur buyers`);
    console.log(`FLUR total supply: ${flurBalances.totalSupply} ${Object.keys(flurBalances.balances).length} owners`);
    console.log(`INFT total supply: ${inftBalances.totalSupply} ${Object.keys(inftBalances.balances).length} owners`);

    console.log(`FLUR total supply included: ${flurBalances.totalSupplyIncluded.toString()}`);
    console.log(`INFT total supply included: ${inftBalances.totalSupplyIncluded.toString()}`);

    const addresses = new Set<string>();
    for (const address of Object.keys(buyers)) {
      addresses.add(address);
    }
    for (const address of Object.keys(flurBalances.balances)) {
      addresses.add(address);
    }
    for (const address of Object.keys(inftBalances.balances)) {
      addresses.add(address);
    }
    console.log(`Found ${addresses.size} unique addresses`);

    let totalXflInftTokenRewards = Object.values(inftBalances.balances).reduce(
      (acc: BigNumber, cur) => acc.add(BigNumber.from(cur).mul(5)),
      BigNumber.from(0)
    );

    let totalXflFlurTokenRewards = Object.values(flurBalances.balances).reduce(
      (acc: BigNumber, cur) => acc.add(cur),
      BigNumber.from(0)
    );

    const xflRewardsExcludingVolume = totalXflInftTokenRewards.add(totalXflFlurTokenRewards);

    const airdropTokens = parseEther(`${800_000_000}`);

    const airdropTokensRemainingBeforeVolume = BigNumber.from(airdropTokens).sub(xflRewardsExcludingVolume);

    console.log(`Total XFL Tokens ${airdropTokens.toString()}`);

    console.log(`Total XFL Tokens Excluding Volume ${xflRewardsExcludingVolume.toString()}`);
    console.log(`Total XFL Tokens Remaining Before Volume ${airdropTokensRemainingBeforeVolume.toString()}`);

    const totalVolumeUSD = Object.values(buyers).reduce(
      (acc, cur) => acc.add(Math.floor(cur.volumeUSD)),
      BigNumber.from(0)
    );

    console.log(`Total Volume USD ${totalVolumeUSD.toString()}`);
    let precision = BigNumber.from(10).pow(18);

    const calculateAirdrop = (
      flurBalance: BigNumberish,
      inftBalance: BigNumberish,
      volumeUSD: number
    ): BigNumberish => {
      const inftXfl = BigNumber.from(inftBalance).mul(5);
      const flurXfl = BigNumber.from(flurBalance).mul(1);

      const volumePortion = BigNumber.from(volumeUSD).mul(precision).div(totalVolumeUSD);
      const volumeXfl = airdropTokensRemainingBeforeVolume.mul(volumePortion).div(precision);

      const totalXfl = inftXfl.add(flurXfl).add(volumeXfl);

      return totalXfl;
    };

    const airdrop: {
      [address: string]: {
        volumeUSD: number;
        flurBalance: BigNumberish;
        inftBalance: BigNumberish;
        xflAirdrop: BigNumberish;
      };
    } = {};

    for (const address of addresses) {
      const flurBalance = flurBalances.balances[address] ?? 0;
      const inftBalance = inftBalances.balances[address] ?? 0;

      const volumeUSD = buyers[address]?.volumeUSD ?? 0;
      const xflAirdrop = calculateAirdrop(flurBalance, inftBalance, volumeUSD);

      airdrop[address] = {
        volumeUSD: volumeUSD,
        flurBalance: flurBalance.toString(),
        inftBalance: inftBalance.toString(),
        xflAirdrop: xflAirdrop.toString()
      };

      if (BigNumber.from(volumeUSD).gt(0) && BigNumber.from(flurBalance).gt(0)) {
        console.log(`Address ${address} has ${volumeUSD} volume and ${flurBalance.toString()} FLUR`);
      }
    }

    await writeFile('./airdrop.json', JSON.stringify(airdrop, null, 2), 'utf-8');

    const db = await getDb();
    let index = 0;
    let batch = new BatchHandler();
    for (const [address, balances] of Object.entries(airdrop)) {
      index += 1;
      await batch.addAsync(db.collection('xflAirdrop').doc(address), balances, { merge: true });

      if (index % 1000 === 0) {
        console.log(`Uploaded ${index} balances`);
      }
    }
    await batch.flush();

    console.log(`Complete!`);
  } catch (err) {
    console.error(err);
  }
  process.exit(1);
}

void main();
