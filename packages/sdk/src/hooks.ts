/**
 * MediVault SDK React Hooks
 * React Query hooks for data fetching and mutations
 */

import { createContext, useContext } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type { MediVaultClient } from './client';
import type { MedicalDocument, StudySummary, Symptom, InsertSymptom, User, LoginResponse, ShareTtl, MintedShare, ListedShare } from './types';

// ============================================
// SDK Context
// ============================================

export const SDKContext = createContext<MediVaultClient | null>(null);

/**
 * Get the MediVault SDK client from context
 * Must be used within an SDKProvider
 */
export function useSDK(): MediVaultClient {
  const sdk = useContext(SDKContext);
  if (!sdk) {
    throw new Error('useSDK must be used within an SDKProvider. Wrap your app with <SDKContext.Provider value={client}>');
  }
  return sdk;
}

// ============================================
// Auth Hooks
// ============================================

/**
 * Hook to get the current authenticated user
 */
export function useAuth(options?: Omit<UseQueryOptions<User | null, Error>, 'queryKey' | 'queryFn'>) {
  const sdk = useSDK();

  return useQuery<User | null, Error>({
    queryKey: ['auth', 'user'],
    queryFn: async () => {
      const result = await sdk.auth.getUser();
      if (result.error) {
        // 401 means not authenticated, return null instead of throwing
        if (result.error.status === 401) {
          return null;
        }
        throw new Error(result.error.message);
      }
      return result.data;
    },
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
}

/**
 * Hook for user login
 */
export function useLogin(
  options?: Omit<UseMutationOptions<LoginResponse, Error, { email: string; password: string }>, 'mutationFn'>
) {
  const sdk = useSDK();
  const queryClient = useQueryClient();

  return useMutation<LoginResponse, Error, { email: string; password: string }>({
    mutationFn: async ({ email, password }) => {
      const result = await sdk.auth.login(email, password);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: (data) => {
      // Set token for mobile clients
      if (data.token) {
        sdk.setToken(data.token);
      }
      // Invalidate auth query to refetch user
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
    ...options,
  });
}

/**
 * Hook for user logout
 */
export function useLogout(
  options?: Omit<UseMutationOptions<void, Error, void>, 'mutationFn'>
) {
  const sdk = useSDK();
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await sdk.auth.logout();
      sdk.setToken(undefined);
    },
    onSuccess: () => {
      // Clear all cached data
      queryClient.clear();
    },
    ...options,
  });
}

// ============================================
// Documents Hooks
// ============================================

/**
 * Hook to fetch all documents
 */
export function useDocuments(
  queryOptions?: { limit?: number },
  options?: Omit<UseQueryOptions<MedicalDocument[], Error>, 'queryKey' | 'queryFn'>
) {
  const sdk = useSDK();

  return useQuery<MedicalDocument[], Error>({
    queryKey: ['documents', queryOptions],
    queryFn: async () => {
      const result = await sdk.documents.list(queryOptions);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Hook to fetch a single document
 */
export function useDocument(
  id: number,
  options?: Omit<UseQueryOptions<MedicalDocument, Error>, 'queryKey' | 'queryFn'>
) {
  const sdk = useSDK();

  return useQuery<MedicalDocument, Error>({
    queryKey: ['documents', id],
    queryFn: async () => {
      const result = await sdk.documents.get(id);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    enabled: !!id,
    ...options,
  });
}

/**
 * Hook to search documents
 */
export function useDocumentSearch(
  query: string,
  options?: Omit<UseQueryOptions<MedicalDocument[], Error>, 'queryKey' | 'queryFn'>
) {
  const sdk = useSDK();

  return useQuery<MedicalDocument[], Error>({
    queryKey: ['documents', 'search', query],
    queryFn: async () => {
      const result = await sdk.documents.search(query);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    enabled: !!query && query.length > 0,
    ...options,
  });
}

/**
 * Hook to fetch documents by type
 */
export function useDocumentsByType(
  type: string,
  options?: Omit<UseQueryOptions<MedicalDocument[], Error>, 'queryKey' | 'queryFn'>
) {
  const sdk = useSDK();

  return useQuery<MedicalDocument[], Error>({
    queryKey: ['documents', 'type', type],
    queryFn: async () => {
      const result = await sdk.documents.getByType(type);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    enabled: !!type,
    ...options,
  });
}

/**
 * Hook to upload a new document
 */
export function useCreateDocument(
  options?: Omit<UseMutationOptions<MedicalDocument, Error, FormData>, 'mutationFn'>
) {
  const sdk = useSDK();
  const queryClient = useQueryClient();

  return useMutation<MedicalDocument, Error, FormData>({
    mutationFn: async (formData) => {
      const result = await sdk.documents.create(formData);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['studies'] });
    },
    ...options,
  });
}

/**
 * Hook to delete a document
 */
export function useDeleteDocument(
  options?: Omit<UseMutationOptions<{ message: string }, Error, number>, 'mutationFn'>
) {
  const sdk = useSDK();
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: async (id) => {
      const result = await sdk.documents.delete(id);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['studies'] });
    },
    ...options,
  });
}

/**
 * Hook to fetch every DICOM study
 */
export function useStudies(
  options?: Omit<UseQueryOptions<StudySummary[], Error>, 'queryKey' | 'queryFn'>
) {
  const sdk = useSDK();

  return useQuery<StudySummary[], Error>({
    queryKey: ['studies'],
    queryFn: async () => {
      const result = await sdk.studies.list();
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

export function useDocumentShares(
  documentId: number,
  options?: Omit<UseQueryOptions<ListedShare[], Error>, 'queryKey' | 'queryFn'>
) {
  const sdk = useSDK();

  return useQuery<ListedShare[], Error>({
    queryKey: ['documents', documentId, 'shares'],
    queryFn: async () => {
      const result = await sdk.documents.listShares(documentId);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    enabled: !!documentId,
    ...options,
  });
}

export function useCreateShare(
  options?: Omit<
    UseMutationOptions<
      MintedShare,
      Error,
      { documentId: number; ttl: ShareTtl; label?: string }
    >,
    'mutationFn'
  >
) {
  const sdk = useSDK();
  const queryClient = useQueryClient();

  return useMutation<
    MintedShare,
    Error,
    { documentId: number; ttl: ShareTtl; label?: string }
  >({
    mutationFn: async ({ documentId, ttl, label }) => {
      const result = await sdk.documents.createShare(documentId, { ttl, label });
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: (_data, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['documents', documentId, 'shares'] });
      queryClient.invalidateQueries({ queryKey: ['shares'] });
    },
    ...options,
  });
}

export function useRevokeShare(
  options?: Omit<
    UseMutationOptions<void, Error, { documentId: number; shareId: number }>,
    'mutationFn'
  >
) {
  const sdk = useSDK();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { documentId: number; shareId: number }>({
    mutationFn: async ({ documentId, shareId }) => {
      const result = await sdk.documents.revokeShare(documentId, shareId);
      if (result.error) {
        throw new Error(result.error.message);
      }
    },
    onSuccess: (_data, { documentId }) => {
      queryClient.invalidateQueries({ queryKey: ['documents', documentId, 'shares'] });
      queryClient.invalidateQueries({ queryKey: ['shares'] });
    },
    ...options,
  });
}

export function useShares(
  options?: Omit<UseQueryOptions<ListedShare[], Error>, 'queryKey' | 'queryFn'>
) {
  const sdk = useSDK();

  return useQuery<ListedShare[], Error>({
    queryKey: ['shares'],
    queryFn: async () => {
      const result = await sdk.shares.list();
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    ...options,
  });
}

export function useCreateCaseShare(
  options?: Omit<
    UseMutationOptions<
      MintedShare,
      Error,
      { documentIds: number[]; ttl: ShareTtl; label?: string; symptomIds?: number[] }
    >,
    'mutationFn'
  >
) {
  const sdk = useSDK();
  const queryClient = useQueryClient();

  return useMutation<
    MintedShare,
    Error,
    { documentIds: number[]; ttl: ShareTtl; label?: string; symptomIds?: number[] }
  >({
    mutationFn: async (input) => {
      const result = await sdk.shares.create(input);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    ...options,
  });
}

export function useRevokeCaseShare(
  options?: Omit<
    UseMutationOptions<void, Error, { shareId: number }>,
    'mutationFn'
  >
) {
  const sdk = useSDK();
  const queryClient = useQueryClient();

  return useMutation<void, Error, { shareId: number }>({
    mutationFn: async ({ shareId }) => {
      const result = await sdk.shares.revoke(shareId);
      if (result.error) {
        throw new Error(result.error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    ...options,
  });
}

// ============================================
// Symptoms Hooks
// ============================================

/**
 * Hook to fetch all symptoms
 */
export function useSymptoms(
  queryOptions?: { limit?: number },
  options?: Omit<UseQueryOptions<Symptom[], Error>, 'queryKey' | 'queryFn'>
) {
  const sdk = useSDK();

  return useQuery<Symptom[], Error>({
    queryKey: ['symptoms', queryOptions],
    queryFn: async () => {
      const result = await sdk.symptoms.list(queryOptions);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Hook to fetch a single symptom
 */
export function useSymptom(
  id: number,
  options?: Omit<UseQueryOptions<Symptom, Error>, 'queryKey' | 'queryFn'>
) {
  const sdk = useSDK();

  return useQuery<Symptom, Error>({
    queryKey: ['symptoms', id],
    queryFn: async () => {
      const result = await sdk.symptoms.get(id);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    enabled: !!id,
    ...options,
  });
}

/**
 * Hook to search symptoms
 */
export function useSymptomSearch(
  query: string,
  options?: Omit<UseQueryOptions<Symptom[], Error>, 'queryKey' | 'queryFn'>
) {
  const sdk = useSDK();

  return useQuery<Symptom[], Error>({
    queryKey: ['symptoms', 'search', query],
    queryFn: async () => {
      const result = await sdk.symptoms.search(query);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    enabled: !!query && query.length > 0,
    ...options,
  });
}

/**
 * Hook to create a new symptom
 */
export function useCreateSymptom(
  options?: Omit<UseMutationOptions<Symptom, Error, Omit<InsertSymptom, 'userId'>>, 'mutationFn'>
) {
  const sdk = useSDK();
  const queryClient = useQueryClient();

  return useMutation<Symptom, Error, Omit<InsertSymptom, 'userId'>>({
    mutationFn: async (data) => {
      const result = await sdk.symptoms.create(data);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['symptoms'] });
    },
    ...options,
  });
}

/**
 * Hook to update an existing symptom
 */
export function useUpdateSymptom(
  options?: Omit<UseMutationOptions<Symptom, Error, { id: number; data: Partial<Omit<InsertSymptom, 'userId'>> }>, 'mutationFn'>
) {
  const sdk = useSDK();
  const queryClient = useQueryClient();

  return useMutation<Symptom, Error, { id: number; data: Partial<Omit<InsertSymptom, 'userId'>> }>({
    mutationFn: async ({ id, data }) => {
      const result = await sdk.symptoms.update(id, data);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['symptoms'] });
      queryClient.invalidateQueries({ queryKey: ['symptoms', id] });
    },
    ...options,
  });
}

/**
 * Hook to delete a symptom
 */
export function useDeleteSymptom(
  options?: Omit<UseMutationOptions<{ message: string }, Error, number>, 'mutationFn'>
) {
  const sdk = useSDK();
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: async (id) => {
      const result = await sdk.symptoms.delete(id);
      if (result.error) {
        throw new Error(result.error.message);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['symptoms'] });
    },
    ...options,
  });
}
