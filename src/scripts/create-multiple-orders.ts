import { ChainId } from '@infinityxyz/lib/types/core';
import { getExchangeAddress, getTxnCurrencyAddress } from '@infinityxyz/lib/utils';
import { ethers } from 'ethers';
import { fundTestWallets } from './orders/fund-test-wallets';
import { getFundingWallet } from './orders/get-funding-wallet';
import { loadWallets } from './orders/load-wallets';
import { mintTokens } from './orders/mint-tokens';
import { postOrder } from './orders/post-order';
import { signOrder } from './orders/sign-order';
import { WalletWithTokens } from './orders/types';
import { setApprovalForAll } from './orders/set-approval-for-all';

export async function createOrders(oneToOne = false) {
  const chainId = ChainId.Goerli;
  const providerUrl = process.env.PROVIDER_URL_GOERLI;

  if (!providerUrl) {
    throw new Error('PROVIDER_URL_GOERLI is required');
  }
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  const signer = getFundingWallet(provider);
  const weth = getTxnCurrencyAddress(chainId);
  const exchange = getExchangeAddress(chainId);
  const numTokens = oneToOne ? 1 : 3; // TODO test one to one
  const goerliDoodles = {
    address: '0x142c5b3a5689ba0871903c53dacf235a28cb21f0',
    costPerToken: ethers.utils.parseEther('0.01')
  };

  const wallets = await loadWallets(provider, weth, 7);
  console.log(`Funding test wallets...`);
  const { testWallets, fundingWallet } = await fundTestWallets(
    wallets,
    signer,
    { amountEth: 0.1, wethAddress: weth },
    provider
  );

  const walletsWithTokens: WalletWithTokens[] = await Promise.all(
    testWallets.map(async (wallet) => {
      console.log(`Minting token for: ${wallet.wallet.address}`);
      const tokens = await mintTokens(
        wallet,
        goerliDoodles.address,
        goerliDoodles.costPerToken.mul(numTokens).toString(),
        numTokens
      );
      console.log(`Minted tokens: ${tokens.map((item) => item.tokenId).join(', ')}`);
      const nfts = [
        {
          collection: goerliDoodles.address,
          tokens: tokens.map(({ tokenId }) => ({
            tokenId,
            numTokens: 1
          }))
        }
      ];
      return { ...wallet, nfts };
    })
  );

  for (const wallet of walletsWithTokens) {
    try {
      const orderDescription = {
        chainId,
        isSellOrder: true,
        numItems: numTokens,
        startPriceEth: 0.01,
        endPriceEth: 0.01,
        startTimeMs: Date.now(),
        endTimeMs: Date.now() + 1000 * 60 * 60 * 24 * 7,
        nfts: wallet.nfts,
        maxGasPriceWei: ethers.utils.parseEther('0.1').toString()
      };
      console.log(`Creating orders for ${wallet.wallet.address} token: ${orderDescription.nfts[0].tokens[0].tokenId}`);
      // create listings
      for (const collection of orderDescription.nfts) {
        collection.collection;
        await setApprovalForAll(collection.collection, exchange, true, wallet.wallet);
      }
      const signedOrder = await signOrder(wallet.wallet, orderDescription);
      await postOrder(wallet.wallet, signedOrder);
      console.log(`Created listing for ${wallet.wallet.address} token: ${orderDescription.nfts[0].tokens[0].tokenId}`);

      // create offers
      const offer = {
        chainId,
        isSellOrder: false,
        numItems: numTokens,
        startPriceEth: 0.02,
        endPriceEth: 0.02,
        startTimeMs: Date.now(),
        endTimeMs: Date.now() + 1000 * 60 * 60 * 24 * 7,
        nfts: wallet.nfts,
        maxGasPriceWei: ethers.utils.parseEther('0.1').toString()
      };

      const signedOffer = await signOrder(fundingWallet.wallet, offer);
      await postOrder(fundingWallet.wallet, signedOffer);
      console.log(`Created offer for ${fundingWallet.wallet.address} token: ${offer.nfts[0].tokens[0].tokenId}`);
    } catch (err) {
      console.error(err);
    }
  }
}

void createOrders(false);
