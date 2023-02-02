import { format, parse } from 'date-fns';
import { formatEther } from 'ethers/lib/utils';

import { AggregationInterval, CurrentStats } from './types';

function calculateStatsBigInt<T>(items: Iterable<T>, _accessor?: (item: T) => bigint | number | null | undefined) {
  const accessor = _accessor ? _accessor : (item: T) => item;
  let numItems = 0;
  let numValidItems = 0;
  let min: bigint | null = null;
  let max: bigint | null = null;
  let sum = BigInt(0);

  for (const item of items) {
    const value = accessor(item);
    numItems += 1;
    const isValidNumber = typeof value === 'number' && !Number.isNaN(value);
    const isValidBigInt = typeof value === 'bigint';

    if (isValidBigInt || isValidNumber) {
      const valueBigInt = BigInt(value);
      numValidItems += 1;
      sum += valueBigInt;
      const currentMin: bigint = min === null ? valueBigInt : min;
      min = currentMin < valueBigInt ? currentMin : valueBigInt;
      const currentMax: bigint = max === null ? valueBigInt : max;
      max = currentMax > valueBigInt ? currentMax : valueBigInt;
    }
  }

  const avg = numValidItems > 0 ? sum / BigInt(numValidItems) : null;

  return {
    min,
    max,
    sum,
    avg,
    numItems,
    numItemsInAvg: numValidItems
  };
}

export function calculateStats<T>(items: Iterable<T>, _accessor?: (item: T) => number | null | undefined) {
  const accessor = _accessor ? _accessor : (item: T) => item;
  let numItems = 0;
  let numValidItems = 0;
  let min: number | null = null;
  let max: number | null = null;
  let sum = 0;

  for (const item of items) {
    const value = accessor(item);
    numItems += 1;
    const isValidNumber = typeof value === 'number' && !Number.isNaN(value);
    if (isValidNumber) {
      numValidItems += 1;
      sum += value;
      const currentMin: number = min === null ? value : min;
      min = currentMin < value ? currentMin : value;
      const currentMax: number = max === null ? value : max;
      max = currentMax > value ? currentMax : value;
    }
  }

  const avg = numValidItems > 0 ? sum / numValidItems : null;

  return {
    min,
    max,
    sum,
    avg,
    numItems,
    numItemsInAvg: numValidItems
  };
}

export function combineCurrentStats(stats: CurrentStats[]): CurrentStats {
  const floorPrice = calculateStats(stats, (item) => item.floorPrice).min;
  const ceilPrice = calculateStats(stats, (item) => item.ceilPrice).max;
  const volume = calculateStats(stats, (item) => item.volume).sum;
  const numSales = calculateStats(stats, (item) => item.numSales).sum;
  const avgPrice = volume / numSales;
  const minProtocolFeeWei = calculateStatsBigInt(stats, (item) =>
    typeof item.minProtocolFeeWei === 'string' ? BigInt(item.minProtocolFeeWei) : null
  ).min;
  const maxProtocolFeeWei = calculateStatsBigInt(stats, (item) =>
    typeof item.maxProtocolFeeWei === 'string' ? BigInt(item.maxProtocolFeeWei) : null
  ).max;
  const sumProtocolFeeWeiBigInt = calculateStatsBigInt(stats, (item) =>
    typeof item.sumProtocolFeeWei === 'string' ? BigInt(item.sumProtocolFeeWei) : null
  ).sum;
  const numSalesWithProtocolFee = calculateStats(stats, (item) => item.numSalesWithProtocolFee).sum;
  const avgProtocolFeeWei =
    numSalesWithProtocolFee > 0 ? sumProtocolFeeWeiBigInt / BigInt(numSalesWithProtocolFee) : null;
  const sumProtocolFeeWei = sumProtocolFeeWeiBigInt?.toString() ?? '0';

  return {
    floorPrice: floorPrice as number,
    ceilPrice: ceilPrice as number,
    volume,
    numSales,
    avgPrice,
    minProtocolFeeWei: minProtocolFeeWei?.toString() ?? null,
    maxProtocolFeeWei: maxProtocolFeeWei?.toString() ?? null,
    avgProtocolFeeWei: avgProtocolFeeWei?.toString() ?? null,
    sumProtocolFeeWei,
    numSalesWithProtocolFee,
    sumProtocolFeeEth: parseFloat(formatEther(sumProtocolFeeWei))
  };
}

const round = (value: number, decimals: number) => {
  const decimalsFactor = Math.pow(10, decimals);
  return Math.floor(value * decimalsFactor) / decimalsFactor;
};

export const calcPercentChange = (prev: number | null, current: number | null, precision = 4) => {
  if (prev == null || current == null) {
    return 0;
  }
  const change = current - prev;
  const decimal = change / Math.abs(prev);
  const percent = decimal * 100;

  if (Number.isNaN(percent) || !Number.isFinite(percent)) {
    return 0;
  }

  return round(percent, precision);
};

export const getIntervalAggregationId = (timestamp: number, interval: AggregationInterval) => {
  if (interval === AggregationInterval.FiveMinutes) {
    const date = format(timestamp, 'yyyy-MM-dd-HH');
    const min = format(timestamp, 'mm');
    const minInt = parseInt(min, 10);
    const intervalNum = `${Math.floor(minInt / 5)}`.padStart(2, '0');
    return `${date}-${intervalNum}`;
  }
  throw new Error(`Id not supported for interval: ${interval}`);
};

export const parseAggregationId = (id: string, interval: AggregationInterval) => {
  if (interval === AggregationInterval.FiveMinutes) {
    const [yyyy, MM, dd, HH, intervalNum] = id.split('-');
    const startMinute = parseInt(intervalNum, 10) * 5;
    const minMM = `${startMinute}`.padStart(2, '0');
    const minDateString = `${yyyy}-${MM}-${dd}-${HH}-${minMM}`;
    const minDate = parse(minDateString, 'yyyy-MM-dd-HH-mm', new Date());
    const fiveMin = 5 * 60 * 1000;
    if (Number.isNaN(minDate.getTime())) {
      throw new Error(`Invalid date string: Min date: ${minDateString} id: ${id}`);
    }
    const startTimestamp = minDate.getTime();
    const endTimestamp = startTimestamp + fiveMin - 1;
    return { startTimestamp: startTimestamp, endTimestamp };
  }

  throw new Error(`Parsing not supported for interval: ${interval}`);
};
