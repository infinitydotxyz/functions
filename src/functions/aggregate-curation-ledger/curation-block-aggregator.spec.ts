import { parse } from 'date-fns';
import { CurationBlockAggregator } from './curation-block-aggregator';

describe('curation block aggregator', () => {
  describe('curation block range', () => {
    const format = 'yyyy-MM-dd-HH';
    const hourZero = '2022-01-01-00';
    const hourOne = '2022-01-01-01';
    const hourTwo = '2022-01-01-02';
    const hourThree = '2022-01-01-03';

    const dateZero = parse(hourZero, format, new Date());
    const dateOne = parse(hourOne, format, new Date());
    const dateTwo = parse(hourTwo, format, new Date());
    const dateThree = parse(hourThree, format, new Date());

    const timestampZero = dateZero.getTime();
    const timestampOne = dateOne.getTime();
    const timestampTwo = dateTwo.getTime();
    const timestampThree = dateThree.getTime();

    it('should return the first block range given the start timestamp - startTimestamp should be inclusive', () => {
      const rangeOne = CurationBlockAggregator.getCurationBlockRange(timestampOne);
      expect(rangeOne.startTimestamp).toBe(timestampOne);
      expect(rangeOne.endTimestamp).toBe(timestampTwo);
      expect(rangeOne.prevTimestamp).toBe(timestampZero);
    });

    it('should return the second block range given the end timestamp of block one - endTimestamp should be exclusive', () => {
      const rangeOne = CurationBlockAggregator.getCurationBlockRange(timestampOne);
      expect(rangeOne.endTimestamp).toBe(timestampTwo);
      const rangeTwo = CurationBlockAggregator.getCurationBlockRange(rangeOne.endTimestamp);
      expect(rangeTwo.startTimestamp).toBe(timestampTwo);
      expect(rangeTwo.endTimestamp).toBe(timestampThree);
      expect(rangeTwo.prevTimestamp).toBe(timestampOne);
      expect(rangeTwo.startTimestamp).toBe(rangeOne.endTimestamp);
    });

    it('should return the first block range given a timestamp between timestamp one and timestamp two', () => {
      const timestamp = (timestampOne + timestampTwo) / 2;
      const rangeOne = CurationBlockAggregator.getCurationBlockRange(timestamp);
      expect(rangeOne.startTimestamp).toBe(timestampOne);
      expect(rangeOne.endTimestamp).toBe(timestampTwo);
      expect(rangeOne.prevTimestamp).toBe(timestampZero);
    });
  });
});
