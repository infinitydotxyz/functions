import { StatsPeriod } from '@infinityxyz/lib/types/core';
import { getStatsDocInfo } from '../aggregate-sales-stats/utils';
import { CurationPeriod as ICurationPeriod, CurationPeriodState } from './types';

export class CurationPeriod {
  static getCurationPeriodRange(timestamp: number): {
    startTimestamp: number;
    endTimestamp: number;
    prevTimestamp: number;
  } {
    const startTimestamp = getStatsDocInfo(timestamp, StatsPeriod.Weekly).timestamp;
    const oneWeek = 60 * 60 * 24 * 7 * 1000;
    const endTimestamp = startTimestamp + oneWeek;
    const prevTimestamp = getStatsDocInfo(startTimestamp - 1, StatsPeriod.Weekly).timestamp;
    return { startTimestamp, endTimestamp, prevTimestamp };
  }

  private _startTimestamp: number;
  private _endTimestamp: number;
  private _prevTimestamp: number;

  constructor(timestamp: number) {
    const { startTimestamp, endTimestamp, prevTimestamp } = CurationPeriod.getCurationPeriodRange(timestamp);
    this._startTimestamp = startTimestamp;
    this._endTimestamp = endTimestamp;
    this._prevTimestamp = prevTimestamp;
  }

  get state(): CurationPeriodState {
    const now = Date.now();
    if (now < this._startTimestamp) {
      return CurationPeriodState.NotStarted;
    } else if (now >= this._startTimestamp && now < this._endTimestamp) {
      return CurationPeriodState.InProgress;
    } else {
      return CurationPeriodState.Completed;
    }
  }
}
