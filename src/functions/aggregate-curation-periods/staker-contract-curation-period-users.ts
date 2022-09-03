import {
  CurationPeriodUser,
  CurationPeriodUsers,
  StakerContractPeriodMetadata,
  StakerContractPeriodUserDoc
} from '@infinityxyz/lib/types/core';
import { formatEth } from '@infinityxyz/lib/utils';

export class StakerContractCurationPeriodUsers {
  protected _users: Map<string, StakerContractPeriodUserDoc>;

  public get size() {
    return this._users.size;
  }

  constructor(protected _metadata: StakerContractPeriodMetadata) {
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
    const periodProtocolFeesAccruedWei = (
      BigInt(user.stats.periodProtocolFeesAccruedWei) + BigInt(curationPeriodUser.stats.periodProtocolFeesAccruedWei)
    ).toString();
    return {
      ...user,
      stats: {
        periodProtocolFeesAccruedWei,
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
        periodProtocolFeesAccruedWei: '0',
        periodProtocolFeesAccruedEth: 0,
        collectionsCurated: 0
      },
      metadata: { ...periodMetadata, userAddress: user.metadata.userAddress || user.user.address }
    };
  }
}
