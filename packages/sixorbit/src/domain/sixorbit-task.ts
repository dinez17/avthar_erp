/**
 * The task registry.
 *
 * SixOrbit's `version` parameter is **per task**, not per client: `login` and
 * `variation/fetch` answer on `1.0`, while `customer/add_customer` and
 * `chkorder/create_order_submit` answer on `4.0`. Sending the wrong one does not fail
 * loudly — it can return a differently shaped payload — so the version belongs beside the
 * task name rather than in a constant somewhere.
 *
 * `method` is here for the same reason: their reads are GETs, and their writes are POSTs
 * carrying a single multipart field. Both facts are properties of the task.
 */

export type SixOrbitHttpMethod = 'GET' | 'POST';

export interface SixOrbitTaskSpec {
  /** The literal `task` query parameter. */
  readonly task: string;
  readonly version: '1.0' | '4.0';
  readonly method: SixOrbitHttpMethod;
  /**
   * Whether `user_id` and `access_token` are appended.
   *
   * False only for `login`, which is how they are obtained in the first place.
   */
  readonly authenticated: boolean;
  /**
   * How the JSON in the `data` field is shaped for POSTs.
   *
   * The multipart `data` value is serialized as one JSON object for writes in this
   * integration. Keep the task setting explicit so each endpoint can be reviewed.
   */
  readonly bodyShape?: 'object' | 'array';
}

/**
 * Every task 12.1 needs, plus the ones later sprints will use.
 *
 * Registered up front so the versions live in one reviewable place, verified against the
 * saved requests in `docs/sixorbit-api/SixOrbit API.postman_collection.json`.
 */
export const SIXORBIT_TASKS = {
  LOGIN: {
    task: 'login',
    version: '1.0',
    method: 'GET',
    authenticated: false,
  },

  // ---- masters (12.2) ----
  FETCH_BRAND: {
    task: 'variation/fetch_brand',
    version: '1.0',
    method: 'GET',
    authenticated: true,
  },
  FETCH_CATEGORY: {
    task: 'variation/fetch_category',
    version: '1.0',
    method: 'GET',
    authenticated: true,
  },
  /** Their spelling, with three t's. Matched exactly; correcting it would 404. */
  FETCH_ATTRIBUTE: {
    task: 'variation/fetch_atttribute',
    version: '1.0',
    method: 'GET',
    authenticated: true,
  },

  // ---- products (12.3 / 12.4) ----
  FETCH_VARIATION: {
    task: 'variation/fetch',
    version: '1.0',
    method: 'GET',
    authenticated: true,
  },
  CREATE_VARIATION: {
    task: 'variation/create_variation_submit',
    version: '4.0',
    method: 'POST',
    authenticated: true,
    bodyShape: 'object',
  },
  EDIT_VARIATION: {
    task: 'variation/edit_variation_submit',
    version: '4.0',
    method: 'POST',
    authenticated: true,
    bodyShape: 'object',
  },

  // ---- customers (12.5) ----
  SEARCH_CUSTOMER: {
    task: 'quotation/quotation_search_customer',
    version: '4.0',
    method: 'GET',
    authenticated: true,
  },
  FETCH_CUSTOMER_FORM: {
    task: 'customer/fetch_addCustomer_form_data',
    version: '4.0',
    method: 'GET',
    authenticated: true,
  },
  ADD_CUSTOMER: {
    task: 'customer/add_customer',
    version: '4.0',
    method: 'POST',
    authenticated: true,
    bodyShape: 'object',
  },
  UPDATE_CUSTOMER: {
    task: 'customer/update_customer',
    version: '4.0',
    method: 'POST',
    authenticated: true,
    bodyShape: 'object',
  },
  CUSTOMER_ADDRESS_LIST: {
    task: 'customer/customer_address_list',
    version: '4.0',
    method: 'GET',
    authenticated: true,
  },
  ADD_CUSTOMER_ADDRESS: {
    task: 'customer/add_customer_address',
    version: '4.0',
    method: 'GET',
    authenticated: true,
  },
  UPDATE_CUSTOMER_ADDRESS: {
    task: 'customer/edit_address_submit',
    version: '4.0',
    method: 'GET',
    authenticated: true,
  },
  FETCH_COUNTRIES_STATES: {
    task: 'user/fetch_countries_states',
    version: '1.0',
    method: 'GET',
    authenticated: true,
  },
  FETCH_CITIES: {
    task: 'user/fetch_cities',
    version: '1.0',
    method: 'GET',
    authenticated: true,
  },
  ADD_CITY: {
    task: 'customer/add_city',
    version: '1.0',
    method: 'GET',
    authenticated: true,
  },

  // ---- orders (12.6) ----
  FETCH_ORDER_FORM_DATA: {
    task: 'chkorder/fetch_order_formData',
    version: '4.0',
    method: 'GET',
    authenticated: true,
  },
  FETCH_ORDER_TEMPLATES: {
    task: 'chkorder/fetch_order_templates',
    version: '4.0',
    method: 'GET',
    authenticated: true,
  },
  CREATE_ORDER: {
    task: 'chkorder/create_order_submit',
    version: '4.0',
    method: 'POST',
    authenticated: true,
    bodyShape: 'object',
  },
} as const satisfies Record<string, SixOrbitTaskSpec>;

export type SixOrbitTaskName = keyof typeof SIXORBIT_TASKS;

/** The `app_flag` their login expects. 2 is the value the working request uses. */
export const SIXORBIT_APP_FLAG = '2';

/** The `urlq` every task carries. Constant across their entire API. */
export const SIXORBIT_URLQ = 'service';
