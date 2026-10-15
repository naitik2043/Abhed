'use client';

/** Signed approver tokens, one per company, kept on this phone. */
export function readTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem('kavach-tokens') ?? '{}');
  } catch {
    return {};
  }
}
export function saveToken(tenant: string, token: string | null) {
  const t = readTokens();
  if (token) t[tenant] = token;
  else delete t[tenant];
  try {
    localStorage.setItem('kavach-tokens', JSON.stringify(t));
  } catch {
    /* private mode */
  }
}
export const authHeader = () => ({ authorization: `Bearer ${Object.values(readTokens()).join(',')}` });
