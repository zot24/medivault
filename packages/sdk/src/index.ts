/**
 * MediVault SDK
 * Typed API client for MediVault health management platform
 *
 * @example
 * ```ts
 * import { createMediVaultClient, SDKContext } from '@medivault/sdk';
 *
 * // Create client
 * const client = createMediVaultClient({ baseUrl: 'https://api.medivault.app' });
 *
 * // Use in React app
 * <SDKContext.Provider value={client}>
 *   <App />
 * </SDKContext.Provider>
 *
 * // Use hooks in components
 * const { data: documents } = useDocuments();
 * ```
 */

// Client exports
export { MediVaultClient, createMediVaultClient } from './client';
export type { SDKConfig, ApiResult, ApiResponse, ApiError } from './client';

// Type exports
export type {
  User,
  MedicalDocument,
  InsertMedicalDocument,
  Symptom,
  InsertSymptom,
  LoginResponse,
  RegisterData,
  DocumentType,
} from './types';
export { DOCUMENT_TYPES } from './types';

// React hooks exports
export { SDKContext, useSDK } from './hooks';

// Auth hooks
export { useAuth, useLogin, useLogout } from './hooks';

// Documents hooks
export {
  useDocuments,
  useDocument,
  useDocumentSearch,
  useDocumentsByType,
  useCreateDocument,
  useDeleteDocument,
} from './hooks';

// Symptoms hooks
export {
  useSymptoms,
  useSymptom,
  useSymptomSearch,
  useCreateSymptom,
  useUpdateSymptom,
  useDeleteSymptom,
} from './hooks';
