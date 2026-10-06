import type { EncryptedBlock } from '@paymentplan/contracts';
export type BlockContext = Pick<EncryptedBlock, 'vaultId' | 'keyId' | 'blockId' | 'purpose'>;
export interface BlockCipher {
  seal(plaintext: Uint8Array, context: BlockContext): Promise<EncryptedBlock>;
  open(block: EncryptedBlock, expectedContext: BlockContext): Promise<Uint8Array>;
}
export * from './vault.ts';
