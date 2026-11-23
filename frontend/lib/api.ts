import { signApiRequest } from './web3';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5055';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('medveil_token');
}

export function setToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('medveil_token', token);
  }
}

export function removeToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('medveil_token');
    localStorage.removeItem('medveil_user');
  }
}

export function getStoredUser(): any | null {
  if (typeof window === 'undefined') return null;
  const user = localStorage.getItem('medveil_user');
  return user ? JSON.parse(user) : null;
}

export function setStoredUser(user: any) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('medveil_user', JSON.stringify(user));
  }
}

async function fetcher(endpoint: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'API Request Failed');
    }
    return data;
  }

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || 'API Request Failed');
  }

  return res.blob();
}

export const api = {
  // Auth
  login: (credentials: any) => fetcher('/api/auth/login', { method: 'POST', body: credentials }),
  register: (data: any) => fetcher('/api/auth/register', { method: 'POST', body: data }),
  getMe: () => fetcher('/api/auth/me'),
  getWalletChallenge: (address: string) => fetcher(`/api/auth/wallet-challenge?address=${address}`),
  verifyWallet: (data: any) => fetcher('/api/auth/wallet-verify', { method: 'POST', body: data }),

  // Hospitals
  getHospitals: () => fetcher('/api/hospitals'),
  getHospitalById: (id: string | number) => fetcher(`/api/hospitals/${id}`),
  getHospitalVerification: (id: string | number) => fetcher(`/api/hospitals/${id}/verification`),
  getHospitalRegistryConfig: () => fetcher('/api/hospitals/registry-config'),

  // Policies
  getPolicies: () => fetcher('/api/policies'),
  getPolicyRegistryConfig: () => fetcher('/api/policies/registry-config'),
  authorizeWallet: (address: string) => fetcher('/api/policies/authorize-wallet', { method: 'POST', body: { address } as any }),
  publishPolicyOnChain: (id: string | number) => fetcher(`/api/policies/${id}/publish`, { method: 'POST' }),
  getPolicyById: (id: string | number) => fetcher(`/api/policies/${id}`),
  createPolicy: (data: any) => fetcher('/api/policies', { method: 'POST', body: data }),

  // Claims
  getClaims: () => fetcher('/api/claims'),
  getClaimById: (id: string | number) => fetcher(`/api/claims/${id}`),
  getClaimCalldata: (id: string | number) => fetcher(`/api/claims/${id}/calldata`),
  createClaim: (data: any) => fetcher('/api/claims', { method: 'POST', body: data }),
  signClaim: (id: string | number) => fetcher(`/api/claims/${id}/sign`, { method: 'POST' }),
  generateProof: (id: string | number) => fetcher(`/api/claims/${id}/generate-proof`, { method: 'POST' }),
  verifyProof: (id: string | number) => fetcher(`/api/claims/${id}/verify-proof`, { method: 'POST' }),
  submitClaim: (id: string | number, data?: any) => fetcher(`/api/claims/${id}/submit`, { method: 'POST', body: data }),

  // Records (Protected by MetaMask Wallet Signatures)
  getRecords: () => fetcher('/api/records'),
  uploadRecord: async (formData: FormData) => {
    const route = '/api/records/upload';
    const authHeaders = await signApiRequest('POST', route, formData);
    return fetcher(route, {
      method: 'POST',
      body: formData,
      headers: authHeaders.headers,
    });
  },
  downloadRecord: async (id: string | number) => {
    const route = `/api/records/${id}/download`;
    const authHeaders = await signApiRequest('GET', route, null);
    return fetcher(route, {
      headers: authHeaders.headers,
    });
  },
  grantAccess: async (id: string | number, data: any) => {
    const route = `/api/records/${id}/grant-access`;
    const authHeaders = await signApiRequest('POST', route, data);
    return fetcher(route, {
      method: 'POST',
      body: data,
      headers: authHeaders.headers,
    });
  },
  revokeAccess: async (id: string | number, data: any) => {
    const route = `/api/records/${id}/revoke-access`;
    const authHeaders = await signApiRequest('POST', route, data);
    return fetcher(route, {
      method: 'POST',
      body: data,
      headers: authHeaders.headers,
    });
  },
  getPermissions: (id: string | number) => fetcher(`/api/records/${id}/permissions`),

  // Audit
  getAuditLogs: () => fetcher('/api/audit'),
  getClaimAudit: (id: string | number) => fetcher(`/api/audit/claims/${id}`),
};
