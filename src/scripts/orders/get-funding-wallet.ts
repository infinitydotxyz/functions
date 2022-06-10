import { ethers } from "ethers";

export function getFundingWallet(provider: ethers.providers.JsonRpcProvider): ethers.Wallet {
    const key = 'FUNDING_WALLET_PRIVATE_KEY'
    const signerPrivateKey = process.env[key];
    if (!signerPrivateKey) {
      throw new Error(`${key} is required`);
    }
    const signer = new ethers.Wallet(signerPrivateKey, provider);
    return signer;
}