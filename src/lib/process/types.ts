import { MetricsOptions } from 'bullmq';

export type ProcessJobResult = Record<string, unknown>;

export type WithTiming<T> = T & {
  timing: {
    created: number;
    started: number;
    completed: number;
  };
};

export type DefaultJob<T> = {
  id: string;
  _processMetadata: {
    type: 'default';
  };
} & T;

export interface HealthCheckJob {
  id: string;
  _processMetadata: {
    type: 'health-check';
  };
}

export type JobDataType<T> = DefaultJob<T> | HealthCheckJob;

export interface ProcessOptions {
  enableMetrics?: boolean | MetricsOptions;
  concurrency?: number;
  debug?: boolean;
  attempts?: number;
  delay?: number;
}
