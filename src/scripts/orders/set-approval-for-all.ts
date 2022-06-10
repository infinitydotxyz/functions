import { ethers } from "ethers";
import { erc721Abi } from "../../tests/abi/erc721";


export async function setApprovalForAll(contractAddress: string, operator: string, approved: boolean, signer: ethers.Wallet) {
    const contract = new ethers.Contract(contractAddress, erc721Abi, signer);
    await contract.setApprovalForAll(operator, approved);
}