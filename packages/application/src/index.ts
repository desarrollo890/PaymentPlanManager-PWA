import { FINANCIAL_CURRENCY, FINANCIAL_TIME_ZONE } from '@paymentplan/domain';
export const foundation = Object.freeze({ currency: FINANCIAL_CURRENCY, timeZone: FINANCIAL_TIME_ZONE, financialRegistrationAvailable: true, googleConnected: false });
export * from './commands.ts';
export * from './session.ts';
export * from './synchronize.ts';
export * from './import.ts';
export * from './bank-import.ts';
