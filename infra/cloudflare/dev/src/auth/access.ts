import { createRemoteJWKSet, customFetch, decodeProtectedHeader, jwtVerify } from 'jose';
import { SecurityFailure } from './errors.js';
import type { VerifiedIdentity } from './types.js';

export type AccessConfiguration = { issuer: string; audience: string };
export function accessConfiguration(issuer: string | undefined, audience: string | undefined): AccessConfiguration {
  // No discovery from unverified claims, arbitrary JWKS URLs or test identities in env.
  if (!issuer || !/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(issuer) || !audience || !/^[a-zA-Z0-9_-]{1,256}$/.test(audience)) {
    throw new SecurityFailure(503, 'security_unavailable');
  }
  return { issuer, audience };
}
export function createAccessVerifier(configuration: AccessConfiguration, fetcher: typeof fetch = fetch) {
  const config = accessConfiguration(configuration.issuer, configuration.audience);
  const endpoint = `${config.issuer}/cdn-cgi/access/certs`;
  const boundedFetch: typeof fetch = async (input, options) => {
    if (String(input) !== endpoint) throw new Error('unexpected_jwks_destination');
    // Workers supports manual/follow, not redirect:error; reject non-200 without following.
    const response = await fetcher(input, { ...options, redirect: 'manual' });
    if (response.status !== 200 || !response.body) throw new Error('jwks_unavailable');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        total += value.byteLength;
        if (total > 65_536) throw new Error('jwks_too_large');
        chunks.push(value);
      }
    } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  // Cache per verifier/isolate, bounded refresh on unknown kid and periodic refresh on expiry.
  const jwks = createRemoteJWKSet(new URL(endpoint), {
    timeoutDuration: 3000, cooldownDuration: 30_000, cacheMaxAge: 300_000,
    [customFetch]: boundedFetch,
  });
  return async (request: Request): Promise<VerifiedIdentity> => {
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token || token.length > 16_384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new SecurityFailure(401, 'unauthenticated');
    try {
      const header = decodeProtectedHeader(token);
      if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(header.kid) || header.jku || header.jwk || header.x5u || header.crit) throw new Error('invalid_header');
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer, audience: config.audience, algorithms: ['RS256'],
        requiredClaims: ['iss','aud','sub','exp','iat'], clockTolerance: 5,
      });
      const now = Math.floor(Date.now() / 1000);
      if (typeof payload.sub !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(payload.sub) || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.iat! > now + 5 || payload.exp! <= payload.iat! || (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf >= payload.exp!))) throw new Error('invalid_identity_or_time');
      return { issuer: config.issuer, subject: payload.sub };
    } catch { throw new SecurityFailure(401, 'unauthenticated'); }
  };
}
