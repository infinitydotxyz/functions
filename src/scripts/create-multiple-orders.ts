import { ChainId, ChainNFTs } from '@infinityxyz/lib/types/core';
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

const GOERLI_DOODLES = {
  address: '0x142c5b3a5689ba0871903c53dacf235a28cb21f0',
  chainId: ChainId.Goerli
};
const baseUrl = 'http://localhost:9090';

const getProviderUrl = (chainId: ChainId) => {
  let url = '';
  switch (chainId) {
    case ChainId.Goerli:
      url = process.env['GOERLI_PROVIDER_URL'] ?? '';
      break;
    case ChainId.Mainnet:
      url = process.env['MAINNET_PROVIDER_URL'] ?? '';
      break;
    default:
      throw new Error(`Unsupported chainId: ${chainId}`);
  }

  if (!url) {
    throw new Error(`No provider url found for chainId: ${chainId}`);
  }

  return url;
};

export async function createOrders(oneToOne = false, numWallets: number) {
  const coll = GOERLI_DOODLES;
  const chainId = coll.chainId;
  const providerUrl = getProviderUrl(coll.chainId);

  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  const signer = getFundingWallet(provider);
  const weth = getTxnCurrencyAddress(chainId);
  const exchange = getExchangeAddress(chainId);
  const numTokens = oneToOne ? 1 : 3; // TODO test one to one
  const goerliDoodles = {
    address: coll.address,
    costPerToken: ethers.utils.parseEther('0.01')
  };

  const wallets = await loadWallets(provider, weth, numWallets);
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
      const signedOrder = await signOrder(wallet.wallet, orderDescription, baseUrl);
      await postOrder(wallet.wallet, signedOrder, baseUrl);
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

      const signedOffer = await signOrder(fundingWallet.wallet, offer, baseUrl);
      await postOrder(fundingWallet.wallet, signedOffer, baseUrl);
      console.log(`Created offer for ${fundingWallet.wallet.address} token: ${offer.nfts[0].tokens[0].tokenId}`);
    } catch (err) {
      console.error(err);
    }
  }
}

async function createMultipleOneToManyOrders() {
  const chainId = ChainId.Goerli;
  const providerUrl = process.env.PROVIDER_URL_GOERLI;

  if (!providerUrl) {
    throw new Error('PROVIDER_URL_GOERLI is required');
  }
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  const signer = getFundingWallet(provider);
  const weth = getTxnCurrencyAddress(chainId);
  const exchange = getExchangeAddress(chainId);
  const numTokens = 1; // TODO test one to one
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
      const sellOrderDescription = {
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
      console.log(
        `Creating orders for ${wallet.wallet.address} token: ${sellOrderDescription.nfts[0].tokens[0].tokenId}`
      );
      // create listings
      for (const collection of sellOrderDescription.nfts) {
        collection.collection;
        await setApprovalForAll(collection.collection, exchange, true, wallet.wallet);
      }
      const signedOrder = await signOrder(wallet.wallet, sellOrderDescription, baseUrl);
      await postOrder(wallet.wallet, signedOrder, baseUrl);
      console.log(
        `Created listing for ${wallet.wallet.address} token: ${sellOrderDescription.nfts[0].tokens[0].tokenId}`
      );
    } catch (err) {
      console.error(err);
    }
  }

  try {
    let numItems = 0;
    const offerNfts: ChainNFTs[] = [];
    for (const wallet of walletsWithTokens) {
      const nfts = wallet.nfts;
      for (const { collection, tokens } of nfts) {
        let coll = offerNfts.find((item) => item.collection === collection);
        if (!coll) {
          coll = { collection, tokens: [] };
          offerNfts.push(coll);
        }
        coll.tokens.push(...tokens);
        numItems += tokens.length;
      }
    }

    // create offers
    const offer = {
      chainId,
      isSellOrder: false,
      numItems,
      startPriceEth: 0.02 * numItems,
      endPriceEth: 0.02 * numItems,
      startTimeMs: Date.now(),
      endTimeMs: Date.now() + 1000 * 60 * 60 * 24 * 7,
      nfts: offerNfts,
      maxGasPriceWei: ethers.utils.parseEther('0.3').toString()
    };

    const signedOffer = await signOrder(fundingWallet.wallet, offer, baseUrl);
    await postOrder(fundingWallet.wallet, signedOffer, baseUrl);
    console.log(`Created offer for ${fundingWallet.wallet.address} token: ${offer.nfts[0].tokens[0].tokenId}`);
  } catch (err) {
    console.error(err);
  }
}

async function createMultipleOneToOneOrders(numWallets: number) {
  await createOrders(true, numWallets);
}

async function createMultipleOrderMatchOrders(numWallets: number) {
  await createOrders(false, numWallets);
}

enum Command {
  Help = 'help',
  CreateOneToOne = '1:1',
  CreateOrdersMatch = 'match',
  CreateOneToMany = '1:many'
}

const helpMessages = {
  [Command.Help]: 'Print the available commands',
  [Command.CreateOneToOne]: 'Create one to one orders',
  [Command.CreateOrdersMatch]: 'Create orders match',
  [Command.CreateOneToMany]: 'Create one to many orders'
};

function helpMessage() {
  const commands = Object.values(Command) as Command[];
  const message = `Available arguments: ${commands.join(', ')}`;
  const example = `Example: npm run create-orders -- ${Command.CreateOneToOne}`;
  const availableCommands = commands.map((command) => `<${command}> ${helpMessages[command]}`);
  console.log(message);
  console.log(example);
  console.table({ availableCommands });
}

async function main() {
  switch (process.argv[2] ?? '') {
    case Command.CreateOneToOne:
      await createMultipleOneToOneOrders(10);
      break;
    case Command.CreateOrdersMatch:
      await createMultipleOrderMatchOrders(5);
      break;
    case Command.CreateOneToMany:
      await createMultipleOneToManyOrders();
      break;
    case Command.Help:
    default:
      helpMessage();
  }
}

void main();
