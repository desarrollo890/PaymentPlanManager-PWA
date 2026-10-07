import { Capacitor, registerPlugin } from '@capacitor/core';
export const isNative = Capacitor.isNativePlatform();
export const NativeAccess = registerPlugin<{
  authorize(): Promise<{ accessToken: string; scope: string; expiresIn: number }>;
  clear(): Promise<void>;
  revoke(): Promise<void>;
  saveDocument(options: { name: string; content: string; mime: string }): Promise<{ saved: boolean }>;
}>('PaymentPlanNative');
