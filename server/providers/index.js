// Registry aller Provider + Status-Erkennung.
import * as claudeCli from './claudeCli.js';
import * as geminiCli from './geminiCli.js';
import * as anthropicApi from './anthropicApi.js';
import * as geminiApi from './geminiApi.js';
import * as demo from './demo.js';

export const PROVIDERS = {
  [claudeCli.info.id]: claudeCli,
  [geminiCli.info.id]: geminiCli,
  [anthropicApi.info.id]: anthropicApi,
  [geminiApi.info.id]: geminiApi,
  [demo.info.id]: demo,
};

export const providerStatus = {};

export async function detectAll() {
  await Promise.all(
    Object.values(PROVIDERS).map(async (p) => {
      try {
        providerStatus[p.info.id] = { ...p.info, ...(await p.detect()) };
      } catch (err) {
        providerStatus[p.info.id] = { ...p.info, available: false, hint: err.message };
      }
    }),
  );
  return providerStatus;
}

export function getProvider(id) {
  return PROVIDERS[id] || null;
}
