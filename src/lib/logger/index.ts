import { Logger, LoggerOptions, createLogger, format, transports } from 'winston';

const log = (level: 'error' | 'info' | 'warn') => {
  const options: LoggerOptions = {
    exitOnError: false,
    format: format.combine(
      format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      format.cli()
    ),
    transports: [new transports.Console()]
  };

  const logger = createLogger(options);

  return (component: string, message: string, ...optionalParams: any[]): Logger => {
    const m = `${component} ${message} ${optionalParams.map((p) => JSON.stringify(p)).join(' ')}`;
    return logger.log(level, m, {
      component,
      version: process.env.npm_package_version
    });
  };
};

export const logger = {
  log: log('info'),
  error: log('error'),
  info: log('info'),
  warn: log('warn')
};

process.on('unhandledRejection', (error) => {
  logger.error('process', `Unhandled rejection: ${error}`);
});

process.on('uncaughtException', (error) => {
  logger.error('process', `Uncaught exception: ${error}`);
});

process.on('exit', (code) => {
  logger.log('process', `Process exiting... Code: ${code}`);
});
