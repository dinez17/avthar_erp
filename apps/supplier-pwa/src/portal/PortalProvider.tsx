import { Box, CircularProgress, MenuItem, TextField, Typography } from '@mui/material';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { PortalParty } from '@tiles-erp/shared-types';
import { AuthLayout } from '../layouts/AuthLayout';
import { usePortalMe } from './api';

interface PortalContextValue {
  fullName: string;
  suppliers: PortalParty[];
  activeSupplierId: string | null;
  activeSupplier: PortalParty | null;
  setActiveSupplierId: (id: string) => void;
}

const PortalContext = createContext<PortalContextValue | undefined>(undefined);

/**
 * Loads which suppliers the signed-in user may act for and holds the active one. A user with
 * no supplier link sees a plain notice rather than an empty portal; one with several gets a
 * switcher in the header.
 */
export function PortalProvider({ children }: { children: ReactNode }): JSX.Element {
  const me = usePortalMe();
  const [activeSupplierId, setActiveSupplierId] = useState<string | null>(null);

  const suppliers = me.data?.suppliers ?? [];
  const resolvedId = activeSupplierId ?? suppliers[0]?.partyId ?? null;

  const value = useMemo<PortalContextValue>(
    () => ({
      fullName: me.data?.fullName ?? '',
      suppliers,
      activeSupplierId: resolvedId,
      activeSupplier: suppliers.find((s) => s.partyId === resolvedId) ?? null,
      setActiveSupplierId,
    }),
    [me.data?.fullName, suppliers, resolvedId],
  );

  if (me.isLoading) {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (suppliers.length === 0) {
    return (
      <AuthLayout
        title="No supplier access"
        subtitle="This login is not linked to a supplier yet. Please contact the company to be granted access."
      />
    );
  }

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used within a PortalProvider');
  return ctx;
}

/** A supplier switcher, shown only when the user fronts more than one supplier. */
export function SupplierSwitcher(): JSX.Element | null {
  const { suppliers, activeSupplierId, setActiveSupplierId } = usePortal();
  if (suppliers.length <= 1) {
    return (
      <Typography variant="subtitle2" color="text.secondary">
        {suppliers[0]?.name}
      </Typography>
    );
  }
  return (
    <TextField
      select
      size="small"
      value={activeSupplierId ?? ''}
      onChange={(e) => setActiveSupplierId(e.target.value)}
      sx={{ minWidth: 200 }}
    >
      {suppliers.map((s) => (
        <MenuItem key={s.partyId} value={s.partyId}>
          {s.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
