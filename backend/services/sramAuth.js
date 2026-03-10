import axios from 'axios';
import { decodeJwt } from 'jose';
import config from '../config.js';

/**
 * Authenticate with SRAM using Resource Owner Password Credentials (ROPC),
 * then exchange the SRAM token for a Hammerhead API token.
 */
export async function loginWithCredentials(email, password) {
  // Step 1: SRAM ROPC – get SRAM access_token
  // Step 1: SRAM ROPC – no audience param (Auth0 rejects audience for password grant)
  let sramData;
  try {
    const res = await axios.post(
      `${config.sram.authUrl}/oauth/token`,
      {
        grant_type: 'password',
        username: email,
        password,
        client_id: config.sram.clientId,
        scope: 'openid profile email offline_access',
        audience: 'https://api.quarqnet.com',
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );
    sramData = res.data;
  } catch (err) {
    const msg = err.response?.data?.error_description
      || err.response?.data?.message
      || err.message;
    throw new Error(`SRAM login failed: ${msg}`);
  }

  const sramAccessToken = sramData.access_token;
  const sramRefreshToken = sramData.refresh_token;

  if (!sramAccessToken) {
    throw new Error('SRAM did not return an access token');
  }

  // Step 2: Exchange SRAM tokens for a Hammerhead token.
  // HAR analysis confirmed: HH expects camelCase { accessToken, refreshToken }.
  const exchangeUrl = `${config.hhApiBase}/v1/auth/sram/mobile/token`;
  const exchangeBody = { accessToken: sramAccessToken, refreshToken: sramRefreshToken };
  console.log('[sramAuth] HH exchange URL:', exchangeUrl);
  console.log('[sramAuth] HH exchange body keys:', Object.keys(exchangeBody));
  console.log('[sramAuth] accessToken (first 40):', sramAccessToken?.slice(0, 40));
  console.log('[sramAuth] refreshToken (first 40):', sramRefreshToken?.slice(0, 40));

  let hhData;
  try {
    const res = await axios.post(exchangeUrl, exchangeBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    hhData = res.data;
  } catch (err) {
    console.error('[sramAuth] HH exchange HTTP status:', err.response?.status);
    console.error('[sramAuth] HH exchange response body:', JSON.stringify(err.response?.data));
    const msg = err.response?.data?.message || err.message;
    throw new Error(`Hammerhead token exchange failed: ${msg}`);
  }

  const accessToken = hhData.access_token || hhData.token;
  const refreshToken = hhData.refresh_token || sramRefreshToken;

  if (!accessToken) {
    throw new Error('Hammerhead did not return an access token');
  }

  // Decode HH JWT to get userId and email
  let userId, sramEmail;
  try {
    const claims = decodeJwt(accessToken);
    userId = claims.sub || claims.userId || claims.user_id;
    sramEmail = claims.sramEmail || claims.email || email;
  } catch {
    throw new Error('Could not decode Hammerhead token');
  }

  if (!userId) throw new Error('Could not extract user ID from token');

  return {
    accessToken,
    refreshToken,
    userId,
    sramEmail,
    expiresAt: Math.floor(Date.now() / 1000) + (hhData.expires_in || 3600),
  };
}
