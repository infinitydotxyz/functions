import { ChainId } from '@infinityxyz/lib/types/core';

import { config } from '../config';
import { Orders, Reservoir } from '../lib';

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

  const factory = new Orders.Transformers.OrderTransformerFactory();

  const transformer = factory.create(chainId, order);

  const result = await transformer.transform();

  console.log('\n\n');
  console.log(JSON.stringify(result, null, 2));
}

void main();

// public async simulateFulfill(params: { to: string; data: string; value: BigNumberish }): Promise<BigNumberish> {
//   const testMatchExecutor = trimLowerCase('0x367b6cF125db1540F0DA0523200781d4b3147ceD');

//   const price = bn(this.startPrice).gt(bn(this.endPrice)) ? this.startPrice : this.endPrice;
//   const result = await getCallTrace(
//     {
//       from: testMatchExecutor,
//       ...params,
//       gas: 10000000,
//       gasPrice: 0,
//       balanceOverrides: {
//         [testMatchExecutor]: price
//       }
//     },
//     this._provider
//   );

//   const gasUsed = bn((result as any).gasUsed);

//   if (result.error) {
//     throw new Error(result.error);
//   }

//   return gasUsed;
// }
