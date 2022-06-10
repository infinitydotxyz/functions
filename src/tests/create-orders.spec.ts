import * as ethers from 'ethers';
import { getTxnCurrencyAddress } from '@infinityxyz/lib/utils/orders';
import { writeFileSync, mkdirSync } from 'fs';
import { config } from 'dotenv';
import { loadWallets } from '../scripts/orders/load-wallets';
import { WalletWithBalances } from '../scripts/orders/types';
import { fundTestWallets } from '../scripts/orders/fund-test-wallets';
import { mintTokens } from '../scripts/orders/mint-tokens';
config();

const network = 5;
const numTestWallets = 6;
const fundingAmount = ethers.utils.parseEther('0.1');
const goerliDoodles = '0x142c5b3a5689ba0871903c53dacf235a28cb21f0';
const currencyAddress = getTxnCurrencyAddress(`${network}`);
const provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL_GOERLI);
const fundingWallet = new ethers.Wallet(process.env.FUNDING_WALLET_PRIVATE_KEY ?? '', provider);
let fundingWalletWithBalance: WalletWithBalances;
let testWallets: WalletWithBalances[] = [];

jest.setTimeout(60_000);

beforeAll(async () => {
  testWallets = await loadWallets(provider, currencyAddress);
  if (testWallets.length < numTestWallets) {
    const numWalletsToCreate = numTestWallets - testWallets.length;
    const newWallets = [...Array(numWalletsToCreate).keys()]
      .map(() => ethers.Wallet.createRandom())
      .map((item) => {
        return { wallet: item, wethBalance: ethers.BigNumber.from(0), ethBalance: ethers.BigNumber.from(0) };
      });
    newWallets.map((item) => {
      mkdirSync('wallets', { recursive: true });
      writeFileSync(`./wallets/${item.wallet.address.toLowerCase()}.txt`, item.wallet.privateKey, { encoding: 'utf8' });
    });
    testWallets = [...testWallets, ...newWallets];
  }

  const res = await fundTestWallets(
    testWallets,
    fundingWallet,
    { amount: fundingAmount, wethAddress: currencyAddress },
    provider
  );
  testWallets = res.testWallets;
  fundingWalletWithBalance = res.fundingWallet;

  console.log(`Funding wallet now has ${fundingWalletWithBalance.ethBalance.toString()}`);

  const numTokens = 2;
  const pricePerToken = ethers.utils.parseEther('0.01');
  const payableAmount = pricePerToken.mul(numTokens);

  const tokens = await mintTokens(fundingWalletWithBalance, goerliDoodles, payableAmount.toString(), numTokens);
  console.log(`Minted ${tokens.length} tokens`);
  console.log(JSON.stringify(tokens, null, 2));
});

test('have expected num test wallets', () => {
  expect(testWallets.length).toBe(numTestWallets);
});

// test('provided funding wallet', () => {
//     const isAddress = ethers.utils.isAddress(fundingWallet.address);
//     expect(isAddress).toBe(true);
// });

// test('has weth address', () => {
//     const currencyAddress = getTxnCurrencyAddress(`${network}`);
//     expect(currencyAddress).toBeDefined();
// });

// test('fund wallets', async () => {

//     const fundingAmount = ethers.utils.parseEther('0.1');
//     const fundingWalletBalance = await fundingWallet.getBalance();
//     expect(fundingWalletBalance.gte(fundingAmount)).toBe(true);
//     let nonce = await fundingWallet.getTransactionCount();
//     const receipts = await Promise.allSettled(wallets.map(async(wallet, index) => {
//         const tx = await fundingWallet.sendTransaction({
//             from: fundingWallet.address,
//             to: wallet.address,
//             value: fundingAmount,
//             nonce: nonce + index,
//         });
//         const res = await tx.wait();
//         return res;
//     }));

//     for(const receipt of receipts) {
//         expect(receipt.status).toBe(1);
//     }
// });
