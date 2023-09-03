import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

import { AirdropTier } from '@/lib/rewards-v2/referrals/sdk';

async function main() {
  const airdropFile = 'airdrop.csv';
  const airdropPath = join(__dirname, '../../', airdropFile);
  const data = await readFile(airdropPath, 'utf8');

  let lines = data.split('\n');

  const header = lines.shift();
  let parsed = lines.map((line) => {
    const [address, mints, volume] = line.split(',').map((item) => item.trim());
    return {
      address: address.toLowerCase(),
      mints: parseInt(mints),
      volume: parseFloat(volume)
    };
  });

  parsed = parsed.filter((item) => {
    return item.mints >= 10 || item.volume >= 980;
  });

  console.log(`Num Accounts: ${parsed.length}`);

  const accountsByMints = parsed
    .sort((a, b) => {
      return b.mints - a.mints;
    })
    .filter((item) => {
      return item.mints > 0;
    });

  const accountsByVolume = parsed
    .sort((a, b) => {
      return b.volume - a.volume;
    })
    .filter((item) => {
      return item.volume > 0;
    });

  console.log(`Number of accounts with mints ${accountsByMints.length}`);
  console.log(`Number of accounts with volume ${accountsByVolume.length}`);

  function calculatePercentiles<T>(data: T[], accessor: (item: T) => number) {
    const sortedNumbers = data.map(accessor).sort((a, b) => b - a);
    const percentilesToInclude = [0, 0.1, 1, 5, 10, 25, 50, 75, 100];
    const percentiles = percentilesToInclude.map((percentile) => {
      let index = Math.round((percentile * sortedNumbers.length) / 100);
      if (Number.isNaN(index) || !index) {
        index = 1;
      }
      return {
        percentile,
        index,
        value: sortedNumbers[index - 1]
      };
    });

    return percentiles;
  }

  function getPercentile(index: number, max: number) {
    return index / max;
  }

  const mintAccessor = (item: { mints: number }) => item.mints;
  const volumeAccessor = (item: { volume: number }) => item.volume;

  const mintPercentiles = calculatePercentiles(accountsByMints, mintAccessor);
  const totalMints = accountsByMints.reduce((acc, item) => {
    return acc + item.mints;
  }, 0);
  console.log(`Total Mints ${totalMints} - Percentiles`);
  console.table(mintPercentiles);

  const volumePercentiles = calculatePercentiles(accountsByVolume, volumeAccessor);
  const totalVolume = accountsByVolume.reduce((acc, item) => {
    return acc + item.volume;
  }, 0);
  console.log(`Total Volume ${totalVolume} - Percentiles`);
  console.table(volumePercentiles);

  const accountsByVolumeWithPercentiles = accountsByVolume.map((item, index) => {
    const volumePercentile = getPercentile(index, accountsByVolume.length - 1);
    return {
      ...item,
      volumePercentile
    };
  });

  const accountsByMintsWithPercentiles = accountsByMints.map((item, index) => {
    const mintPercentile = getPercentile(index, accountsByMints.length - 1);
    return {
      ...item,
      mintPercentile
    };
  });

  console.log(
    accountsByMintsWithPercentiles[0],
    accountsByMintsWithPercentiles[3],
    accountsByMintsWithPercentiles[accountsByMintsWithPercentiles.length - 1]
  );

  const accounts: Record<string, { mintPercentile: number; volumePercentile: number; mints: number; volume: number }> =
    {};

  accountsByMintsWithPercentiles.forEach((item) => {
    const account = accounts[item.address] || {
      mintPercentile: 1,
      volumePercentile: 1,
      mints: 0,
      volume: 0
    };

    account.mintPercentile = item.mintPercentile;
    account.mints = item.mints;
    accounts[item.address] = account;
  });

  accountsByVolumeWithPercentiles.forEach((item) => {
    const account = accounts[item.address] || {
      mintPercentile: 1,
      volumePercentile: 1,
      mints: 0,
      volume: 0
    };

    account.volumePercentile = item.volumePercentile;
    account.volume = item.volume;
    accounts[item.address] = account;
  });

  const accountsWithScores = Object.entries(accounts)
    .map(([address, account]) => {
      const score = 1 / account.mintPercentile + 1 / account.volumePercentile;
      return {
        address,
        score,
        ...account
      };
    })
    .sort((a, b) => {
      return b.score - a.score;
    });

  const scorePercentiles = calculatePercentiles(accountsWithScores, (item) => item.score);

  console.log(`Score Percentiles`);
  console.table(scorePercentiles);

  const accountsWithScorePercentiles = accountsWithScores
    .map((item, index) => {
      const scorePercentile = getPercentile(index, accountsWithScores.length - 1);
      return {
        ...item,
        scorePercentile
      };
    })
    .sort((a, b) => b.scorePercentile - a.scorePercentile);

  const tiers = {
    platinum: 0.05,
    gold: 0.2,
    silver: 0.5,
    bronze: 1
  };

  let totalByTier = {
    platinum: 0,
    gold: 0,
    silver: 0,
    bronze: 0
  };
  const accountsWithTiers = accountsWithScorePercentiles.map((item) => {
    let tier: AirdropTier = 'NONE';
    if (item.scorePercentile <= tiers.platinum) {
      tier = 'PLATINUM';
      totalByTier['platinum'] += 1;
    } else if (item.scorePercentile <= tiers.gold) {
      tier = 'GOLD';
      totalByTier['gold'] += 1;
    } else if (item.scorePercentile <= tiers.silver) {
      tier = 'SILVER';
      totalByTier['silver'] += 1;
    } else {
      tier = 'BRONZE';
      totalByTier['bronze'] += 1;
    }

    return {
      ...item,
      tier
    };
  });

  console.log(`Total by tier`);
  console.table(totalByTier);

  await writeFile('./airdrop.json', JSON.stringify(accountsWithTiers, null, 2));
}

main();
