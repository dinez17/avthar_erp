/** Entity-specific behavioural rules applied by the generic catalog handlers. */
export interface CatalogRules {
  label: string;
  requiresParent: boolean;
}

export const CATEGORY_RULES: CatalogRules = { label: 'Category', requiresParent: false };
export const BRAND_RULES: CatalogRules = { label: 'Brand', requiresParent: false };
export const SERIES_RULES: CatalogRules = { label: 'Series', requiresParent: true };
export const COLLECTION_RULES: CatalogRules = { label: 'Collection', requiresParent: true };
