/**
 * MediVault API Client
 * Typed API client for both web (cookies) and mobile (JWT) authentication
 */

import type {
  User,
  MedicalDocument,
  DocumentFileEntry,
  StudySummary,
  Symptom,
  InsertSymptom,
  LoginResponse,
  RegisterData,
  ShareTtl,
  MintedShare,
  ListedShare,
} from './types';

export interface SDKConfig {
  /** Base URL for API requests (e.g., 'http://localhost:3000' or '') */
  baseUrl: string;
  /** JWT token for mobile authentication. Omit for web (uses cookies) */
  token?: string;
  /** Custom fetch implementation (useful for React Native) */
  fetch?: typeof fetch;
  /** Custom headers to include in all requests */
  headers?: Record<string, string>;
}

export interface ApiResponse<T> {
  data: T;
  error?: never;
}

export interface ApiError {
  data?: never;
  error: {
    status: number;
    message: string;
    code?: string;
  };
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

/**
 * MediVault API Client
 *
 * @example
 * ```ts
 * // Web usage (cookies)
 * const client = createMediVaultClient({ baseUrl: '' });
 *
 * // Mobile usage (JWT)
 * const client = createMediVaultClient({
 *   baseUrl: 'https://api.medivault.app',
 *   token: 'jwt-token-here'
 * });
 * ```
 */
export class MediVaultClient {
  private baseUrl: string;
  private token?: string;
  private fetchFn: typeof fetch;
  private customHeaders: Record<string, string>;

  constructor(config: SDKConfig) {
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.fetchFn = config.fetch ?? fetch.bind(globalThis);
    this.customHeaders = config.headers ?? {};
  }

  /**
   * Set or update the JWT token (for mobile auth)
   */
  setToken(token: string | undefined): void {
    this.token = token;
  }

  /**
   * Get the current token
   */
  getToken(): string | undefined {
    return this.token;
  }

  /**
   * Check if client has a token set
   */
  hasToken(): boolean {
    return !!this.token;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      formData?: FormData;
      headers?: Record<string, string>;
    }
  ): Promise<ApiResult<T>> {
    const headers: Record<string, string> = { ...this.customHeaders };

    // Add authorization header for JWT auth
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
      headers['X-Client-Type'] = 'mobile';
    }

    // Add content-type for JSON body
    if (options?.body && !options.formData) {
      headers['Content-Type'] = 'application/json';
    }

    // Merge any additional headers
    if (options?.headers) {
      Object.assign(headers, options.headers);
    }

    try {
      const res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: options?.formData ?? (options?.body ? JSON.stringify(options.body) : undefined),
        credentials: this.token ? 'omit' : 'include', // Use cookies for web, omit for mobile
      });

      // Handle non-OK responses
      if (!res.ok) {
        const text = await res.text();
        let message = text;
        try {
          const json = JSON.parse(text);
          message = json.message || json.error || text;
        } catch {
          // Keep text as message
        }
        return {
          error: {
            status: res.status,
            message,
          },
        };
      }

      // Handle empty responses
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        return { data: undefined as T };
      }

      const data = await res.json();
      return { data };
    } catch (err) {
      return {
        error: {
          status: 0,
          message: err instanceof Error ? err.message : 'Network error',
          code: 'NETWORK_ERROR',
        },
      };
    }
  }

  // ============================================
  // Auth Methods
  // ============================================
  auth = {
    /**
     * Login with email and password
     * For mobile clients, returns a JWT token
     */
    login: async (email: string, password: string): Promise<ApiResult<LoginResponse>> => {
      return this.request<LoginResponse>('POST', '/api/login', {
        body: { email, password, mobile: !!this.token || this.customHeaders['X-Client-Type'] === 'mobile' },
      });
    },

    /**
     * Logout current user
     */
    logout: async (): Promise<ApiResult<{ message: string }>> => {
      return this.request('POST', '/api/logout');
    },

    /**
     * Get current authenticated user
     */
    getUser: async (): Promise<ApiResult<User>> => {
      return this.request<User>('GET', '/api/auth/user');
    },

    /**
     * Register a new user
     */
    register: async (data: RegisterData): Promise<ApiResult<LoginResponse>> => {
      return this.request<LoginResponse>('POST', '/api/register', {
        body: { ...data, mobile: !!this.token || this.customHeaders['X-Client-Type'] === 'mobile' },
      });
    },
  };

  // ============================================
  // Documents Methods
  // ============================================
  documents = {
    /**
     * List all documents for the current user
     */
    list: async (options?: { limit?: number }): Promise<ApiResult<MedicalDocument[]>> => {
      const params = options?.limit ? `?limit=${options.limit}` : '';
      return this.request<MedicalDocument[]>('GET', `/api/documents${params}`);
    },

    /**
     * Get a single document by ID
     */
    get: async (id: number): Promise<ApiResult<MedicalDocument>> => {
      return this.request<MedicalDocument>('GET', `/api/documents/${id}`);
    },

    /**
     * Search documents by query string
     */
    search: async (query: string): Promise<ApiResult<MedicalDocument[]>> => {
      return this.request<MedicalDocument[]>(
        'GET',
        `/api/documents/search?q=${encodeURIComponent(query)}`
      );
    },

    /**
     * Get documents filtered by type
     */
    getByType: async (type: string): Promise<ApiResult<MedicalDocument[]>> => {
      return this.request<MedicalDocument[]>('GET', `/api/documents/type/${type}`);
    },

    /**
     * Upload a new document
     * @param formData FormData containing file and metadata
     */
    create: async (formData: FormData): Promise<ApiResult<MedicalDocument>> => {
      return this.request<MedicalDocument>('POST', '/api/documents', { formData });
    },

    /**
     * Append more files (DICOM slices) to an existing series
     * @param formData FormData with one or more `files` entries
     */
    appendFiles: async (
      id: number,
      formData: FormData,
    ): Promise<ApiResult<{ fileCount: number }>> => {
      return this.request<{ fileCount: number }>('POST', `/api/documents/${id}/files`, {
        formData,
      });
    },

    /**
     * List the files of a document in display order
     */
    listFiles: async (id: number): Promise<ApiResult<DocumentFileEntry[]>> => {
      return this.request<DocumentFileEntry[]>('GET', `/api/documents/${id}/files`);
    },

    /**
     * URL of one file of a document by position
     */
    getFileAtUrl: (id: number, position: number): string => {
      return `${this.baseUrl}/api/documents/${id}/files/${position}`;
    },

    /**
     * Delete a document by ID
     */
    delete: async (id: number): Promise<ApiResult<{ message: string }>> => {
      return this.request<{ message: string }>('DELETE', `/api/documents/${id}`);
    },

    /**
     * Get the URL for downloading a file
     */
    getFileUrl: (filename: string): string => {
      return `${this.baseUrl}/api/files/${filename}`;
    },

    createShare: async (
      id: number,
      body: { ttl: ShareTtl; label?: string },
    ): Promise<ApiResult<MintedShare>> => {
      return this.request<MintedShare>('POST', `/api/documents/${id}/shares`, {
        body,
      });
    },

    listShares: async (id: number): Promise<ApiResult<ListedShare[]>> => {
      return this.request<ListedShare[]>('GET', `/api/documents/${id}/shares`);
    },

    revokeShare: async (
      id: number,
      shareId: number,
    ): Promise<ApiResult<void>> => {
      return this.request<void>('DELETE', `/api/documents/${id}/shares/${shareId}`);
    },
  };

  // ============================================
  // Studies Methods
  // ============================================
  studies = {
    /**
     * List every DICOM study — records grouped by studyInstanceUid
     */
    list: async (): Promise<ApiResult<StudySummary[]>> => {
      return this.request<StudySummary[]>('GET', '/api/studies');
    },
  };

  shares = {
    create: async (body: {
      documentIds: number[];
      ttl: ShareTtl;
      label?: string;
      symptomIds?: number[];
    }): Promise<ApiResult<MintedShare>> => {
      return this.request<MintedShare>('POST', '/api/shares', { body });
    },

    list: async (): Promise<ApiResult<ListedShare[]>> => {
      return this.request<ListedShare[]>('GET', '/api/shares');
    },

    revoke: async (shareId: number): Promise<ApiResult<void>> => {
      return this.request<void>('DELETE', `/api/shares/${shareId}`);
    },
  };

  // ============================================
  // Symptoms Methods
  // ============================================
  symptoms = {
    /**
     * List all symptoms for the current user
     */
    list: async (options?: { limit?: number }): Promise<ApiResult<Symptom[]>> => {
      const params = options?.limit ? `?limit=${options.limit}` : '';
      return this.request<Symptom[]>('GET', `/api/symptoms${params}`);
    },

    /**
     * Get a single symptom by ID
     */
    get: async (id: number): Promise<ApiResult<Symptom>> => {
      return this.request<Symptom>('GET', `/api/symptoms/${id}`);
    },

    /**
     * Search symptoms by query string
     */
    search: async (query: string): Promise<ApiResult<Symptom[]>> => {
      return this.request<Symptom[]>(
        'GET',
        `/api/symptoms/search?q=${encodeURIComponent(query)}`
      );
    },

    /**
     * Create a new symptom
     */
    create: async (data: Omit<InsertSymptom, 'userId'>): Promise<ApiResult<Symptom>> => {
      return this.request<Symptom>('POST', '/api/symptoms', { body: data });
    },

    /**
     * Update an existing symptom
     */
    update: async (id: number, data: Partial<Omit<InsertSymptom, 'userId'>>): Promise<ApiResult<Symptom>> => {
      return this.request<Symptom>('PUT', `/api/symptoms/${id}`, { body: data });
    },

    /**
     * Delete a symptom by ID
     */
    delete: async (id: number): Promise<ApiResult<{ message: string }>> => {
      return this.request<{ message: string }>('DELETE', `/api/symptoms/${id}`);
    },
  };
}

/**
 * Create a new MediVault API client
 *
 * @example
 * ```ts
 * // For web app (uses cookies)
 * const client = createMediVaultClient({ baseUrl: '' });
 *
 * // For mobile app (uses JWT)
 * const client = createMediVaultClient({
 *   baseUrl: 'https://api.medivault.app',
 *   token: await SecureStore.getItemAsync('auth_token')
 * });
 * ```
 */
export function createMediVaultClient(config: SDKConfig): MediVaultClient {
  return new MediVaultClient(config);
}
