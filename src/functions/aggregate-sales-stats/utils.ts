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
