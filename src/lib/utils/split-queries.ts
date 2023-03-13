import { BigNumber, ethers } from 'ethers';

import { CollGroupRef, CollRef, Query } from '@/firestore/types';

export const splitQueries = <T>(
  ref: CollGroupRef<T> | CollRef<T> | Query<T>,
  numQueries: number,
  type: 'address' | 'bytes32' | 'uint256-num'
) => {
  let max: BigNumber;
  let isHex = true;

  if (type === 'address') {
    const addressMin = ethers.constants.AddressZero;
    const addressLength = addressMin.length;
    const addressMax = '0xf'.padEnd(addressLength, 'f');
    max = BigNumber.from(addressMax);
  } else if (type === 'bytes32') {
    const hashMin = ethers.constants.HashZero;
    const hashLength = hashMin.length;
    const hashMax = '0xf'.padEnd(hashLength, 'f');
    max = BigNumber.from(hashMax);
  } else if (type === 'uint256-num') {
    max = ethers.constants.MaxUint256;
    isHex = false;
  } else {
    throw new Error('Invalid type');
  }

  const len = isHex ? max.toHexString().length : max.toString().length;
  const queries = [];
  for (let i = 0; i < numQueries; i++) {
    const start = isHex
      ? max.mul(i).div(numQueries).toHexString().padEnd(len, '0')
      : max.mul(i).div(numQueries).toString();
    const end = isHex
      ? max
          .mul(i + 1)
          .div(numQueries)
          .toHexString()
      : max
          .mul(i + 1)
          .div(numQueries)
          .toString();

    queries.push({
      query: ref.where('__name__', '>=', start).where('__name__', '<=', end),
      max: end,
      min: start
    });
  }

  return queries;
};
