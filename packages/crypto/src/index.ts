import type { EncryptedBlock } from '@paymentplan/contracts';

export type BlockContext = Pick<EncryptedBlock, 'vaultId' | 'keyId' | 'blockId' | 'purpose'>;

// Port for an unlocked cipher. Implementation and key lifecycle belong to F3.
export interface BlockCipher {
  seal(plaintext: Uint8Array, context: BlockContext): Promise<EncryptedBlock>;
  open(block: EncryptedBlock, expectedContext: BlockContext): Promise<Uint8Array>;
}
