import { CreateOrderDto } from "@infinityxyz/lib/types/dto/orders";
import { ethers } from "ethers";
import * as phin from 'phin';
import { getAuthHeaders } from "./get-auth-headers";

export async function postOrder(signer: ethers.Wallet, order: CreateOrderDto) {
    const authHeaders = await getAuthHeaders(signer);
    const response = await phin({
      url: `http://localhost:9090/orders/${signer.address}`,
      method: 'POST',
      data: {
        orders: [order]
      },
      headers: {
        ...authHeaders,
      }
    });
  
    if (response.statusCode === 201) {
      console.log(`${order.signedOrder.isSellOrder ? "Sell" : "Buy"} order created for wallet ${signer.address} successfully`);
      return;
    }
    console.log(`Error creating order: ${response.statusCode} ${response.body.toString()}`);
  }