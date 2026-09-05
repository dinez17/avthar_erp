import type { OrgEndpoint } from './api';

export interface OrgEntityConfig {
  key: string;
  endpoint: OrgEndpoint;
  title: string;
  subtitle: string;
  singular: string;
  /** Parent selector configuration; undefined for the hierarchy root. */
  parent?: { endpoint: OrgEndpoint; label: string };
  hasCode: boolean;
  hasLegalName: boolean;
  hasGstin: boolean;
  /** Whether the level captures address/phone/email details (Company + Branch). */
  hasContact: boolean;
  /** Whether the level supports bulk creation (Gate, Rack). */
  bulk: boolean;
  childLabel: string;
}

export const ORG_ENTITIES: Record<string, OrgEntityConfig> = {
  companies: {
    key: 'companies',
    endpoint: '/companies',
    title: 'Companies',
    subtitle: 'Top level of the organisation hierarchy.',
    singular: 'company',
    hasCode: false,
    hasLegalName: true,
    hasGstin: true,
    hasContact: true,
    bulk: false,
    childLabel: 'Branches',
  },
  branches: {
    key: 'branches',
    endpoint: '/branches',
    title: 'Branches',
    subtitle: 'Branches belong to a company and carry their own GSTIN.',
    singular: 'branch',
    parent: { endpoint: '/companies', label: 'Company' },
    hasCode: true,
    hasLegalName: false,
    hasGstin: true,
    hasContact: true,
    bulk: false,
    childLabel: 'Godowns',
  },
  godowns: {
    key: 'godowns',
    endpoint: '/godowns',
    title: 'Godowns',
    subtitle: 'Warehouses within a branch.',
    singular: 'godown',
    parent: { endpoint: '/branches', label: 'Branch' },
    hasCode: true,
    hasLegalName: false,
    hasGstin: false,
    hasContact: false,
    bulk: false,
    childLabel: 'Gates',
  },
  gates: {
    key: 'gates',
    endpoint: '/gates',
    title: 'Gates',
    subtitle: 'Loading/unloading points within a godown.',
    singular: 'gate',
    parent: { endpoint: '/godowns', label: 'Godown' },
    hasCode: true,
    hasLegalName: false,
    hasGstin: false,
    hasContact: false,
    bulk: true,
    childLabel: 'Racks',
  },
  racks: {
    key: 'racks',
    endpoint: '/racks',
    title: 'Racks',
    subtitle: 'Optional storage racks within a gate.',
    singular: 'rack',
    parent: { endpoint: '/gates', label: 'Gate' },
    hasCode: true,
    hasLegalName: false,
    hasGstin: false,
    hasContact: false,
    bulk: true,
    childLabel: '—',
  },
};
