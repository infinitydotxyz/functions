import { ERC721ABI } from "@infinityxyz/lib/abi/erc721";
import { trimLowerCase } from "@infinityxyz/lib/utils";
import { ethers } from "ethers";

const ethProvider = new ethers.providers.StaticJsonRpcProvider(process.env.alchemyJsonRpcEthMainnet);

export function getProvider(chainId: string) {
  if (chainId === '1') {
    return ethProvider;
  }
  return undefined;
}

export async function getErc721Owner(token: { address: string; tokenId: string; chainId: string }): Promise<string> {
  const contract = new ethers.Contract(token.address, ERC721ABI, getProvider(token.chainId));
  const owner = trimLowerCase(await contract.ownerOf(token.tokenId));
  return owner;
}