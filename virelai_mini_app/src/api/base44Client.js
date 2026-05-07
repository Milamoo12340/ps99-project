import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { token, functionsVersion, appBaseUrl } = appParams;

export const base44 = createClient({
  appId: "69c2415c0f74b28eb1ba3ed0",
  token,
  functionsVersion,
  requiresAuth: false,
  appBaseUrl
});
