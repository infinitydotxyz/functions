import { ethers } from 'ethers';
import { erc721Abi } from '../../tests/abi/erc721';

export async function setApprovalForAll(
  contractAddress: string,
  operator: string,
  approved: boolean,
  signer: ethers.Wallet
) {
  const contract = new ethers.Contract(contractAddress, erc721Abi, signer);
  const isApproved = await contract.isApprovedForAll(signer.address, operator);
  console.log(`${signer.address} isApprovedForAll Operator: ${operator}  ${isApproved ? '✅ ' : '❌'}`);
  if (!isApproved) {
    console.log(`Approving ${operator} for ${signer.address}`);
    await contract.setApprovalForAll(operator, approved);
  }
}
