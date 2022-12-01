import { ServiceAccount } from 'firebase-admin';

import * as serviceAccount from '../creds/nftc-dev-firebase-creds.json';

// TODO adi change in release

export const config = {
  firebase: {
    serviceAccount: serviceAccount as ServiceAccount,
    region: 'us-east1'
  }
};
