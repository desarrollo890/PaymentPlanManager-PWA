import { FINANCIAL_CURRENCY, FINANCIAL_TIME_ZONE } from '@paymentplan/domain';
import type { BlockCipher } from '@paymentplan/crypto';
import type { EncryptedLocalStore } from '@paymentplan/storage';
import type { RemoteBlockTransport } from '@paymentplan/sync';

export interface ApplicationPorts {
  readonly localStore: EncryptedLocalStore;
  readonly cipher: BlockCipher;
  readonly remote: RemoteBlockTransport | null;
}

// No financial commands are exposed until domain parity and persistence pass F2/F3.
export const foundation = Object.freeze({
  currency: FINANCIAL_CURRENCY,
  timeZone: FINANCIAL_TIME_ZONE,
  financialRegistrationAvailable: false,
  googleConnected: false,
});
