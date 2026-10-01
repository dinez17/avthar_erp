import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { useEffect } from 'react';
import { ColorModeProvider, EnterKeyNavigation, SaveShortcut } from '@tiles-erp/ui';
import { queryClient } from '../lib/query-client';
import { AuthProvider } from '../auth/AuthProvider';
import { router } from '../router/routes';
import { BrandingEffect } from './branding';

/**
 * Browsers increment focused number fields when the page is scrolled over them. Blur
 * before the native wheel action so the page keeps scrolling and the value stays put.
 */
function NumberInputWheelGuard(): null {
  useEffect(() => {
    const guard = (event: WheelEvent): void => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.type === 'number' && target === document.activeElement) {
        target.blur();
      }
    };
    document.addEventListener('wheel', guard, { capture: true, passive: true });
    return () => document.removeEventListener('wheel', guard, true);
  }, []);
  return null;
}

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
          <NumberInputWheelGuard />
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ColorModeProvider>
  );
}
