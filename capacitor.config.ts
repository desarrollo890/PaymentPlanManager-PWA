import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.sardeip.PaymentPlanManager', appName: 'PaymentPlan', webDir: 'apps/pwa/dist-native',
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  loggingBehavior: 'none',
  server: { androidScheme: 'https' },
};
export default config;
