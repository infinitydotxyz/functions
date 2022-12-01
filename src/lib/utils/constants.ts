import { BigNumber } from 'ethers/lib/ethers';

export const ETHER = BigNumber.from(10).pow(18);
export const GWEI = BigNumber.from(10).pow(9);

export const DISCORD_WEBHOOK_URL =
  process.env.DISCORD_WEBHOOK_URL ||
  'https://discord.com/api/webhooks/1035601491584634990/GlNcNKeo-mNa54EPhrcpGo0Vur99p8oPm95Iumnh49hnpEUj7Hjwa1_VZss36xPdAOMx';
