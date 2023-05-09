import { TypedDataDomain, TypedDataSigner } from '@ethersproject/abstract-signer';
import { Signature } from '@ethersproject/bytes';
import { Provider } from '@ethersproject/providers';

import { Types } from '..';
import { OrderParams } from '../order-params';

export interface Complication {
  domain: TypedDataDomain;

  address: string;

  supportsBulkSignatures: boolean;

  supportsContractSignatures: boolean;

  sign(signer: TypedDataSigner, params: Types.InternalOrder): Promise<string>;

  verifySignature(sig: string, params: Types.InternalOrder, provider?: Provider): Promise<void>;

  getSignatureData(params: Types.InternalOrder): Types.SignatureData;

  checkFillability(provider: Provider, order: OrderParams): Promise<void>;

  checkBaseValid(): void;

  joinSignature(sig: Signature | { v: number; r: string; s: string }): string;
}
