/**
 * MediVault SDK instance for mobile
 */

import Constants from 'expo-constants';

// SDK types (inline to avoid workspace dependency issues during initial setup)
export interface SDKConfig {
  baseUrl: string;
  token?: string;
  headers?: Record<string, string>;
}

export interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

export interface MedicalDocument {
  id: number;
  userId: string;
  title: string;
  description: string | null;
  documentType: string;
  fileName: string;
  filePath: string;
  fileSize: string;
  mimeType: string;
  documentDate: string;
  doctorName: string | null;
  facilityName: string | null;
  tags: string[] | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface Symptom {
  id: number;
  userId: string;
  symptomName: string;
  severity: number;
  description: string | null;
  location: string | null;
  duration: string | null;
  triggers: string[] | null;
  medications: string[] | null;
  notes: string | null;
  dateRecorded: string;
  timeOfDay: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface LoginResponse {
  message: string;
  user: User;
  token?: string;
}

export type ApiResult<T> = { data: T; error?: never } | { data?: never; error: { status: number; message: string } };

// Get API URL from environment
const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000';

class MediVaultClient {
  private baseUrl: string;
  private token?: string;

  constructor(config: SDKConfig) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
  }

  setToken(token: string | undefined) {
    this.token = token;
  }

  getToken() {
    return this.token;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: { body?: unknown; formData?: FormData }
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = {
      'X-Client-Type': 'mobile',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    if (options?.body && !options.formData) {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: options?.formData ?? (options?.body ? JSON.stringify(options.body) : undefined),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const json = JSON.parse(text);
          message = json.message || text;
        } catch {}
        return { error: { status: res.status, message } };
      }

      const contentType = res.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        return { data: undefined as T };
      }

      const data = await res.json();
      return { data };
    } catch (err) {
      return {
        error: {
          status: 0,
          message: err instanceof Error ? err.message : 'Network error',
        },
      };
    }
  }

  // Auth
  auth = {
    login: async (email: string, password: string): Promise<ApiResult<LoginResponse>> => {
      return this.request('POST', '/api/login', { body: { email, password, mobile: true } });
    },
    logout: async (): Promise<ApiResult<{ message: string }>> => {
      return this.request('POST', '/api/logout');
    },
    getUser: async (): Promise<ApiResult<User>> => {
      return this.request('GET', '/api/auth/user');
    },
    register: async (data: { email: string; password: string; firstName?: string; lastName?: string }): Promise<ApiResult<LoginResponse>> => {
      return this.request('POST', '/api/register', { body: { ...data, mobile: true } });
    },
  };

  // Documents
  documents = {
    list: async (options?: { limit?: number }): Promise<ApiResult<MedicalDocument[]>> => {
      const params = options?.limit ? `?limit=${options.limit}` : '';
      return this.request('GET', `/api/documents${params}`);
    },
    get: async (id: number): Promise<ApiResult<MedicalDocument>> => {
      return this.request('GET', `/api/documents/${id}`);
    },
    search: async (query: string): Promise<ApiResult<MedicalDocument[]>> => {
      return this.request('GET', `/api/documents/search?q=${encodeURIComponent(query)}`);
    },
    create: async (formData: FormData): Promise<ApiResult<MedicalDocument>> => {
      return this.request('POST', '/api/documents', { formData });
    },
    delete: async (id: number): Promise<ApiResult<{ message: string }>> => {
      return this.request('DELETE', `/api/documents/${id}`);
    },
    getFileUrl: (filename: string) => `${this.baseUrl}/api/files/${filename}`,
  };

  // Symptoms
  symptoms = {
    list: async (options?: { limit?: number }): Promise<ApiResult<Symptom[]>> => {
      const params = options?.limit ? `?limit=${options.limit}` : '';
      return this.request('GET', `/api/symptoms${params}`);
    },
    get: async (id: number): Promise<ApiResult<Symptom>> => {
      return this.request('GET', `/api/symptoms/${id}`);
    },
    search: async (query: string): Promise<ApiResult<Symptom[]>> => {
      return this.request('GET', `/api/symptoms/search?q=${encodeURIComponent(query)}`);
    },
    create: async (data: Partial<Symptom>): Promise<ApiResult<Symptom>> => {
      return this.request('POST', '/api/symptoms', { body: data });
    },
    update: async (id: number, data: Partial<Symptom>): Promise<ApiResult<Symptom>> => {
      return this.request('PUT', `/api/symptoms/${id}`, { body: data });
    },
    delete: async (id: number): Promise<ApiResult<{ message: string }>> => {
      return this.request('DELETE', `/api/symptoms/${id}`);
    },
  };
}

// Create SDK instance
export const sdk = new MediVaultClient({ baseUrl: API_URL });

export { MediVaultClient };
