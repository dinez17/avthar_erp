import type { PartyEndpoint } from './api';

export interface PartyEntityConfig {
  key: string;
  endpoint: PartyEndpoint;
  title: string;
  subtitle: string;
  singular: string;
  /** Customers carry credit terms; suppliers carry payment terms. */
  kind: 'customer' | 'supplier';
  /** Phone is mandatory for customers. */
  requiresPhone: boolean;
}

export const PARTY_ENTITIES: Record<string, PartyEntityConfig> = {
  customers: {
    key: 'customers',
    endpoint: '/customers',
    title: 'Customers',
    subtitle: 'Buyers with GST details and credit terms.',
    singular: 'customer',
    kind: 'customer',
    requiresPhone: true,
  },
  suppliers: {
    key: 'suppliers',
    endpoint: '/suppliers',
    title: 'Suppliers',
    subtitle: 'Vendors with GST details and payment terms.',
    singular: 'supplier',
    kind: 'supplier',
    requiresPhone: false,
  },
};
