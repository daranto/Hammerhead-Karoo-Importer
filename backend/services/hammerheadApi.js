import axios from 'axios';
import config from '../config.js';
import { getTokens, saveTokens, getStoredCredentials } from '../auth/tokenStore.js';
import { decryptPassword } from '../auth/credentialStore.js';
import { loginWithCredentials } from './sramAuth.js';

function createApiClient(userId) {
  const client = axios.create({
    baseURL: `${config.hhApiBase}/v1`,
    timeout: 30000,
  });

  // Inject Authorization header
  client.interceptors.request.use(async (reqConfig) => {
    const tokens = getTokens(userId);
    if (tokens) {
      reqConfig.headers.Authorization = `Bearer ${tokens.access_token}`;
    }
    return reqConfig;
  });

  // 401 → refresh token and retry once
  client.interceptors.response.use(
    (res) => res,
    async (error) => {
      const original = error.config;
      if (error.response?.status === 401 && !original._retry) {
        original._retry = true;
        try {
          const tokens = getTokens(userId);
          if (!tokens?.refresh_token) throw new Error('No refresh token');

          const refreshRes = await axios.post(
            `${config.hhApiBase}/v1/auth/sram/mobile/token`,
            { refresh_token: tokens.refresh_token, grant_type: 'refresh_token' },
            { headers: { 'Content-Type': 'application/json' } }
          );

          const data = refreshRes.data;
          const newAccess = data.access_token || data.token;
          const newRefresh = data.refresh_token || tokens.refresh_token;
          const expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in || 3600);

          saveTokens({
            userId,
            accessToken: newAccess,
            refreshToken: newRefresh,
            expiresAt,
            sramEmail: tokens.sram_email,
          });

          original.headers.Authorization = `Bearer ${newAccess}`;
          return client(original);
        } catch (refreshErr) {
          console.error('Token refresh failed:', refreshErr.message);
          // Last resort: re-login with stored credentials
          try {
            const stored = getStoredCredentials();
            if (stored?.sram_password_enc) {
              const password = decryptPassword(stored.sram_password_enc, stored.credentials_iv);
              const result = await loginWithCredentials(stored.sram_email, password);
              saveTokens({
                userId: result.userId,
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                expiresAt: result.expiresAt,
                sramEmail: result.sramEmail,
              });
              original.headers.Authorization = `Bearer ${result.accessToken}`;
              return client(original);
            }
          } catch (reloginErr) {
            console.error('Credential re-login failed:', reloginErr.message);
          }
          return Promise.reject(error);
        }
      }
      return Promise.reject(error);
    }
  );

  return client;
}

export function getHHClient(userId) {
  return createApiClient(userId);
}

export async function fetchActivitiesPage(userId, page = 1, perPage = 50) {
  const client = getHHClient(userId);
  const res = await client.get(`/users/${userId}/activities`, {
    params: { page, perPage, orderBy: 'NEWEST' },
  });
  return res.data;
}

export async function fetchActivityDetails(userId, activityId) {
  const client = getHHClient(userId);
  const res = await client.get(`/users/${userId}/activities/${activityId}/details`);
  return res.data;
}

export async function fetchActivityFile(userId, activityId) {
  const client = getHHClient(userId);
  const res = await client.get(`/users/${userId}/activities/${activityId}/file`, {
    params: { format: 'fit' },
    responseType: 'arraybuffer',
  });
  return Buffer.from(res.data);
}
