import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ColorModeProvider, EnterKeyNavigation, SaveShortcut } from '@tiles-erp/ui';
import { queryClient } from '../lib/query-client';
import { AuthProvider } from '../auth/AuthProvider';
import { router } from '../router/routes';
import { BrandingEffect } from './branding';

/** Composes the global providers: theme, data-fetching, auth and routing. */
export function AppProviders(): JSX.Element {
  return (
    <ColorModeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          {/* Sets the document title and swaps the favicon. Inside the query
              provider because it reads branding, outside the router because it
              applies to every route including the login screen. */}
          <BrandingEffect />
          <EnterKeyNavigation />
          <SaveShortcut />
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ColorModeProvider>
  );
}
