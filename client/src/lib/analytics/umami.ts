/**
 * Umami Analytics - Privacy-focused tracking utilities
 *
 * Features:
 * - Type-safe event tracking
 * - No cookies, no PII
 * - GDPR compliant
 * - Auto-enriched with device/geo context
 */

// Extend window object to include umami
declare global {
  interface Window {
    umami?: {
      track: (eventName: string, eventData?: Record<string, any>) => void;
    };
  }
}

/**
 * Standard event properties that can be tracked
 */
export interface EventProperties {
  // Document-related
  document_type?: string;
  document_id?: string;

  // User actions
  button_id?: string;
  location?: string;
  form_type?: string;

  // Feature usage
  feature?: string;
  action?: string;

  // Appointment tracking
  appointment_type?: string;
  days_until_appointment?: number;

  // Upload tracking
  file_type?: string;
  file_size?: number;
  upload_success?: boolean;

  // Search & filter
  search_query?: string;
  filter_type?: string;
  results_count?: number;

  // Navigation
  page_path?: string;
  referrer?: string;

  // Error tracking
  error_type?: string;
  error_message?: string;

  // Generic properties
  [key: string]: string | number | boolean | undefined;
}

/**
 * Track a custom event with Umami
 *
 * @param eventName - Event name in snake_case (e.g., 'document_uploaded')
 * @param properties - Event properties for context
 *
 * @example
 * trackEvent('document_uploaded', {
 *   document_type: 'lab_result',
 *   file_size: 1024000
 * })
 */
export function trackEvent(
  eventName: string,
  properties?: EventProperties
): void {
  // Check if Umami is loaded
  if (typeof window === 'undefined' || !window.umami) {
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Umami event (not loaded):', eventName, properties);
    }
    return;
  }

  try {
    // Track the event
    window.umami.track(eventName, properties);

    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Umami event tracked:', eventName, properties);
    }
  } catch (error) {
    console.error('Failed to track Umami event:', error);
  }
}

/**
 * Track page view (usually automatic, but can be called manually for SPAs)
 */
export function trackPageView(path?: string): void {
  trackEvent('page_view', {
    page_path: path || window.location.pathname,
    referrer: document.referrer || 'direct',
  });
}

/**
 * Medical Records specific tracking functions
 */
export const analytics = {
  // Document events
  documentUploaded: (documentType: string, fileSize: number) => {
    trackEvent('document_uploaded', {
      document_type: documentType,
      file_size: fileSize,
      upload_success: true,
    });
  },

  documentUploadFailed: (documentType: string, errorMessage: string) => {
    trackEvent('document_upload_failed', {
      document_type: documentType,
      error_message: errorMessage,
      upload_success: false,
    });
  },

  documentViewed: (documentType: string, documentId: string) => {
    trackEvent('document_viewed', {
      document_type: documentType,
      document_id: documentId,
    });
  },

  documentDeleted: (documentType: string) => {
    trackEvent('document_deleted', {
      document_type: documentType,
    });
  },

  documentSearched: (query: string, resultsCount: number) => {
    trackEvent('document_searched', {
      search_query: query.substring(0, 50), // Truncate for privacy
      results_count: resultsCount,
    });
  },

  documentFiltered: (filterType: string, resultsCount: number) => {
    trackEvent('document_filtered', {
      filter_type: filterType,
      results_count: resultsCount,
    });
  },

  // Appointment events
  appointmentScheduled: (doctorName: string, daysUntil: number) => {
    trackEvent('appointment_scheduled', {
      // Don't send actual doctor name (PII) - just track the action
      appointment_type: 'scheduled',
      days_until_appointment: daysUntil,
    });
  },

  appointmentRemoved: () => {
    trackEvent('appointment_removed', {
      appointment_type: 'removed',
    });
  },

  // Symptom events
  symptomLogged: (severity: number) => {
    trackEvent('symptom_logged', {
      // Don't send actual symptom (PHI) - just track engagement
      action: 'logged',
      // Can track severity as it's not identifying
    });
  },

  // Button/CTA clicks
  ctaClicked: (buttonId: string, location: string) => {
    trackEvent('cta_clicked', {
      button_id: buttonId,
      location: location,
    });
  },

  // Feature usage
  featureViewed: (featureName: string) => {
    trackEvent('feature_viewed', {
      feature: featureName,
    });
  },

  featureUsed: (featureName: string, action: string) => {
    trackEvent('feature_used', {
      feature: featureName,
      action: action,
    });
  },

  // Navigation
  pageVisited: (pagePath: string) => {
    trackEvent('page_visited', {
      page_path: pagePath,
    });
  },

  // Error tracking
  errorOccurred: (errorType: string, errorMessage: string) => {
    trackEvent('error_occurred', {
      error_type: errorType,
      error_message: errorMessage.substring(0, 100), // Truncate
    });
  },

  // Auth events
  userLoggedIn: () => {
    trackEvent('user_logged_in', {
      action: 'login',
    });
  },

  userLoggedOut: () => {
    trackEvent('user_logged_out', {
      action: 'logout',
    });
  },
};

export default analytics;
