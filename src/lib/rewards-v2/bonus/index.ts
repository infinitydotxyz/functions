import { BigNumber, BigNumberish } from 'ethers';

export const BonusMultiplier = {
  LevelZero: {
    minBalance: 0,
    multiplier: 1
  },
  LevelOne: {
    minBalance: 1_000_000,
    multiplier: 2
  },
  LevelTwo: {
    minBalance: 5_000_000,
    multiplier: 5
  },
  LevelThree: {
    minBalance: 10_000_000,
    multiplier: 10
  }
};

export const getBonusLevel = (balance: BigNumberish) => {
  balance = BigNumber.from(balance).toBigInt();
  const levels = Object.values(BonusMultiplier).sort((a, b) => b.minBalance - a.minBalance);
  const level = levels.find((level) => balance >= BigInt(level.minBalance));
  console.assert(!!level, `Failed to find bonus for balance ${balance}`);

  return (
    level ?? {
      minBalance: 0,
      multiplier: 1
    }
  );
};
