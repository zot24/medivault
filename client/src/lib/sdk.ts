/**
 * MediVault SDK Setup for Web App
 * Provides the SDK client instance and React provider
 */

import { MediVaultClient, SDKContext } from '@medivault/sdk';
import React from 'react';

// Create SDK client for web (uses cookies, no token needed)
export const sdk = new MediVaultClient({
  baseUrl: '', // Same origin, relative URLs
});

// Re-export SDKContext for the provider
export { SDKContext };

// Re-export all hooks for convenience
export {
  useSDK,
  useAuth,
  useLogin,
  useLogout,
  useDocuments,
  useDocument,
  useDocumentSearch,
  useDocumentsByType,
  useCreateDocument,
  useDeleteDocument,
  useDocumentShares,
  useCreateShare,
  useRevokeShare,
  useSymptoms,
  useSymptom,
  useSymptomSearch,
  useCreateSymptom,
  useUpdateSymptom,
  useDeleteSymptom,
} from '@medivault/sdk';

export type { ShareTtl, MintedShare, ListedShare } from '@medivault/sdk';

// SDK Provider component
export function SDKProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(SDKContext.Provider, { value: sdk }, children);
}
