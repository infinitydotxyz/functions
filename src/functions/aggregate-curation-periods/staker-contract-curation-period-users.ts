import { CurationPeriodUser, CurationPeriodUsers } from '@infinityxyz/lib/types/core';
import { formatEth } from '@infinityxyz/lib/utils';
import { StakerContractPeriodMetadata, StakerContractPeriodUserDoc } from './types';

export class StakerContractCurationPeriodUsers {
  protected _users: Map<string, StakerContractPeriodUserDoc>;

  public get size(){ 
    return this._users.size;
  }

  constructor(
    protected _metadata: StakerContractPeriodMetadata
  ) {
    this._users = new Map();
  }

  public update(users: CurationPeriodUsers) {
    for (const curationPeriodUser of Object.values(users)) {
      const user = this._getUser(curationPeriodUser);
      const updatedUser = this._getUpdatedUser(user, curationPeriodUser);
      this._users.set(user.metadata.userAddress, updatedUser);
    }
  }

  public get array(): StakerContractPeriodUserDoc[] {
    return [...this._users.values()];
  }

  protected _getUpdatedUser(
    user: StakerContractPeriodUserDoc,
    curationPeriodUser: CurationPeriodUser
  ): StakerContractPeriodUserDoc {
    const totalProtocolFeesAccruedWei = (
      BigInt(user.stats.totalProtocolFeesAccruedWei) + BigInt(curationPeriodUser.stats.totalProtocolFeesAccruedWei)
    ).toString();
    const periodProtocolFeesAccruedWei = (
      BigInt(user.stats.periodProtocolFeesAccruedWei) + BigInt(curationPeriodUser.stats.periodProtocolFeesAccruedWei)
    ).toString();
    return {
      ...user,
      stats: {
        totalProtocolFeesAccruedWei,
        periodProtocolFeesAccruedWei,
        totalProtocolFeesAccruedEth: formatEth(totalProtocolFeesAccruedWei),
        periodProtocolFeesAccruedEth: formatEth(periodProtocolFeesAccruedWei),
        collectionsCurated: user.stats.collectionsCurated + 1
      }
    };
  }

  protected _getUser(curationPeriodUser: CurationPeriodUser): StakerContractPeriodUserDoc {
    const address = curationPeriodUser.metadata.userAddress || curationPeriodUser.user.address;
    const user = this._users.get(address) ?? this._getInitialPeriodUser(curationPeriodUser);
    return user;
  }

  protected _getInitialPeriodUser(user: CurationPeriodUser): StakerContractPeriodUserDoc {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { trigger, ...periodMetadata } = this._metadata;
    return {
      user: user.user,
      stats: {
        totalProtocolFeesAccruedWei: '0',
        periodProtocolFeesAccruedWei: '0',
        totalProtocolFeesAccruedEth: 0,
        periodProtocolFeesAccruedEth: 0,
        collectionsCurated: 0
      },
      metadata: { ...periodMetadata, userAddress: user.metadata.userAddress || user.user.address }
    };
  }
}
