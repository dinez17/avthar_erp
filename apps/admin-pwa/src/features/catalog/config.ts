import type { CatalogEndpoint } from './api';

export interface CatalogEntityConfig {
  key: string;
  endpoint: CatalogEndpoint;
  title: string;
  subtitle: string;
  singular: string;
  /** Present when the entity belongs to a brand. */
  parent?: { endpoint: CatalogEndpoint; label: string };
  childLabel?: string;
  /** Brands: offer a supplier select whose choice supplies every product under the brand. */
  supplierField?: boolean;
}

export const CATALOG_ENTITIES: Record<string, CatalogEntityConfig> = {
  categories: {
    key: 'categories',
    endpoint: '/categories',
    title: 'Categories',
    subtitle: 'Product categories, e.g. Vitrified, Ceramic, Sanitary.',
    singular: 'category',
  },
  brands: {
    key: 'brands',
    endpoint: '/brands',
    title: 'Brands',
    subtitle: 'Manufacturer brands carried by your business.',
    singular: 'brand',
    childLabel: 'Series + collections',
    supplierField: true,
  },
  series: {
    key: 'series',
    endpoint: '/series',
    title: 'Series',
    subtitle: 'Product series within a brand.',
    singular: 'series',
    parent: { endpoint: '/brands', label: 'Brand' },
  },
  collections: {
    key: 'collections',
    endpoint: '/collections',
    title: 'Collections',
    subtitle: 'Design collections within a brand.',
    singular: 'collection',
    parent: { endpoint: '/brands', label: 'Brand' },
  },
};
