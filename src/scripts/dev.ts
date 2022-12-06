import { BigNumberish, ethers } from 'ethers';
import { parseEther, parseUnits } from 'ethers/lib/utils';

import { getCallTrace } from '@georgeroman/evm-tx-simulator';
import { ChainId } from '@infinityxyz/lib/types/core';
import { trimLowerCase } from '@infinityxyz/lib/utils';
import { Seaport } from '@reservoir0x/sdk';

import { bn } from '@/lib/utils';
import { getProvider } from '@/lib/utils/ethersUtils';

import { config } from '../config';
import { Orderbook, Reservoir } from '../lib';

const testMatchExecutor = trimLowerCase('0x367b6cF125db1540F0DA0523200781d4b3147ceD');

async function main() {
  const chainId = ChainId.Mainnet;

  const client = Reservoir.Api.getClient(chainId, config.reservoir.apiKey);
  const response = await Reservoir.Api.Orders.AskOrders.getOrders(client, {
    limit: 1,
    includeRawData: true,
    ids: '0xc83db84706f9984e90d424e6c321ab82f5dbdb42dcb61b52ed587a9c442a1b1f'
  });
  const order = response.data.orders[0];

  console.log(JSON.stringify(order, null, 2));

  const factory = new Orderbook.Transformers.OrderTransformerFactory();

  const transformer = factory.create(chainId, order);

  const result = await transformer.transform();

  console.log('\n\n');
  console.log(JSON.stringify(result, null, 2));

  if (!result.isNative) {
    const o = result.sourceOrder;
    const seaport = new Seaport.Exchange(1);

    const matchParams = o.buildMatching();
    const data = seaport.fillOrderTx(testMatchExecutor, o, matchParams);
    const provider = getProvider(ChainId.Mainnet);
    if (!provider) {
      throw new Error('Failed to get provider');
    }
    const res = await simulateFulfill(data, provider);
    const gasUsed = bn(res).toString();
    console.log(`Gas Used: ${gasUsed}`);
  }
}

void main();

async function simulateFulfill(
  params: { to: string; data: string; value?: BigNumberish; from: string },
  provider: ethers.providers.StaticJsonRpcProvider
): Promise<BigNumberish> {
  //   const price = bn(this.startPrice).gt(bn(this.endPrice)) ? this.startPrice : this.endPrice;
  try {
    const result = await getCallTrace(
      {
        ...params,
        gas: 10000000,
        gasPrice: parseUnits('50', 'gwei'),
        value: params.value ?? '0',
        balanceOverrides: {
          [testMatchExecutor]: bn(params.value ?? '0').add(parseEther('1'))
        }
      },
      provider
    );

    console.log(JSON.stringify(result, null, 2));
    const gasUsed = bn((result as any).gasUsed);

    if (result.error) {
      throw new Error(result.error);
    }
    if (!bn(result.output).eq(1)) {
      throw new Error(`Reverted`);
    }

    return gasUsed;
  } catch (err) {
    console.error(err);
    return '0';
  }
}
