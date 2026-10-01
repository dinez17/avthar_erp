import type { Prisma, PrismaClient } from '@prisma/client';
import { SIXORBIT_TASKS } from '../domain/sixorbit-task';
import { SixOrbitApiError } from '../domain/sixorbit.errors';
import type { SixOrbitClient } from './sixorbit.client';

type SearchRow = { id?: string; alid?: string; mobile?: string; name?: string; new_name?: string; display_name?: string; customer_number?: string; customer_code?: string; email?: string; gstin?: string; pan?: string; city?: string; billing_address?: string; billing_pincode?: string; billing_stid?: string; billing_ctid?: string; baid?: string; said?: string };
type FormData = { default_account_groupId?: string; customers_types?: Array<{ cutid?: string; name?: string }>; customer_sales_types?: Array<{ custid?: string; name?: string }> };
const value = (v: unknown): string | null => v == null ? null : String(v).trim() || null;
const NAME_TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'sri', 'shri', 'thiru', 'selvi']);

export const normalizeCustomerName = (name: string): string =>
  name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((part) => part && !NAME_TITLES.has(part))
    .join(' ');

const rowCustomerName = (row: SearchRow): string =>
  value(row.display_name) ?? value(row.new_name) ?? value(row.name)?.replace(/\s*\[[^\]]*]\s*$/, '') ?? '';

export const customerNamesMatch = (localName: string, sixOrbitName: string): boolean => {
  const local = normalizeCustomerName(localName);
  const remote = normalizeCustomerName(sixOrbitName);
  if (!local || !remote) return false;
  if (local === remote || local.replace(/\s/g, '') === remote.replace(/\s/g, '')) return true;

  const localParts = new Set(local.split(' '));
  const remoteParts = new Set(remote.split(' '));
  const smaller = localParts.size <= remoteParts.size ? localParts : remoteParts;
  const larger = smaller === localParts ? remoteParts : localParts;
  return [...smaller].every((part) => part.length >= 4 && larger.has(part));
};

export class SixOrbitCustomerPushService {
  constructor(private readonly prisma: PrismaClient, private readonly client: SixOrbitClient) {}

  async push(customerId: string): Promise<{ customerId: string; operation: 'create' | 'update' | 'import'; sixorbitId: string; adopted: boolean }> {
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, deletedAt: null } });
    if (!customer) throw new Error('Customer not found');
    const phone = customer.phone?.trim();
    if (!phone) throw new Error('Customer phone number is required for SixOrbit search.');
    await this.prisma.customer.update({ where: { id: customerId }, data: { sixorbitSyncStatus: 'PENDING', sixorbitSyncError: null } });
    try {
      const findExisting = async (): Promise<SearchRow | null> => {
        const search = await this.client.call<{ customerList?: SearchRow[] | false }>({ spec: SIXORBIT_TASKS.SEARCH_CUSTOMER, params: { search: phone, balance: 1 }, log: { entityType: 'CUSTOMER', entityId: customerId, direction: 'PULL' } });
        if (!search.ok) {
          if (search.resultCode === '20004' && /^No customer found\.?$/i.test(search.message.trim())) return null;
          throw new SixOrbitApiError(`Could not search SixOrbit customer by phone: ${search.message}`, search.kind, search.resultCode);
        }
        const matches = (Array.isArray(search.data.customerList) ? search.data.customerList : []).filter((row) => value(row.mobile) === phone);
        // An edited phone or name must never redirect an already linked customer.
        if (customer.sixorbitId) return matches.find((row) => value(row.id) === customer.sixorbitId) ?? null;
        const exactNamed = matches.filter((row) => {
          const local = normalizeCustomerName(customer.name);
          const remote = normalizeCustomerName(rowCustomerName(row));
          return local === remote || (local && local.replace(/\s/g, '') === remote.replace(/\s/g, ''));
        });
        if (exactNamed.length === 1) return exactNamed[0]!;
        const named = matches.filter((row) => customerNamesMatch(customer.name, rowCustomerName(row)));
        if (named.length === 1) return named[0]!;
        if (matches.length === 1) return matches[0]!;
        if (matches.length > 1) throw new Error('Multiple SixOrbit customers share this phone number. No unique customer name match was found.');
        return null;
      };
      const adopt = async (row: SearchRow) => {
        const sixorbitId = value(row.id);
        if (!sixorbitId) throw new Error('SixOrbit search returned no customer id.');
        const updated = await this.prisma.customer.updateMany({ where: { id: customerId, version: customer.version, deletedAt: null }, data: {
          sixorbitId, sixorbitAlid: value(row.alid), sixorbitCustomerNumber: value(row.customer_number),
          sixorbitCustomerCode: value(row.customer_code), sixorbitRaw: row as Prisma.InputJsonValue,
          ...(rowCustomerName(row) ? { name: rowCustomerName(row) } : {}),
          ...(row.email !== undefined ? { email: value(row.email) } : {}),
          ...(row.gstin !== undefined ? { gstin: value(row.gstin) } : {}),
          ...(row.pan !== undefined ? { panNumber: value(row.pan) } : {}),
          ...(row.city !== undefined ? { city: value(row.city) } : {}),
          ...(row.billing_address !== undefined ? { addressLine1: value(row.billing_address), addressLine2: null } : {}),
          ...(row.billing_pincode !== undefined ? { pincode: value(row.billing_pincode) } : {}),
          ...(row.billing_stid === '24' ? { stateCode: '33' } : {}),
          sixorbitSyncStatus: 'SYNCED', sixorbitSyncedAt: new Date(), sixorbitSyncError: null, version: { increment: 1 },
        }});
        if (!updated.count) throw new Error('Customer changed during sync. Reload and retry.');
        return { customerId, operation: 'import' as const, sixorbitId, adopted: true };
      };
      const existing = await findExisting();
      if (existing && !customer.sixorbitId) return await adopt(existing);

      const form = await this.client.callOrThrow<FormData>({ spec: SIXORBIT_TASKS.FETCH_CUSTOMER_FORM, log: { entityType: 'CUSTOMER', entityId: customerId, direction: 'PULL' } });
      const retailType = form.customers_types?.find((x) => x.name?.toLowerCase() === 'retail')?.cutid ?? '24';
      const retailSalesType = form.customer_sales_types?.find((x) => x.name?.toLowerCase() === 'retail')?.custid ?? '1';
      const parts = customer.name.trim().split(/\s+/); const fname = parts.shift() ?? customer.name; const lname = parts.join(' ');
      const cuid = value(customer.sixorbitId ?? existing?.id);
      const payload: Record<string, unknown> = {
        ...(cuid ? { cuid } : {}), 'customer-type-radio': '2', email: customer.email ?? '', fname, lname,
        display_name: customer.name.trim(), registration_type: '', dontCall_checked: '0', dnd_checked: '0',
        company_name: '', mobile: phone, 'current-line1': customer.addressLine1 ?? '', 'current-line2': customer.addressLine2 ?? '',
        'current-area': customer.city ?? '', 'current-ctid': '1', 'current-stid': customer.stateCode === '33' ? '24' : '',
        'current-coverid': '', 'current-pincode': customer.pincode ?? '', site_addr: '0', 'contact-detail-check': '0',
        'contact-person-combo': '', gstin: customer.gstin ?? '', telephone: customer.altPhone ?? '', salutation: '0', website: '',
        'refer-codeid': '', 'refer-cuid': '', soft_credit_limit: String(customer.creditLimit), hard_credit_limit: String(customer.creditLimit),
        soft_credit_days: String(customer.creditDays), hard_credit_days: String(customer.creditDays),
        'ledger-group': form.default_account_groupId ?? '', 'customer-type': retailType, 'customer-sales-type': retailSalesType,
        'current-add-mobile': phone, 'current-add-fname': fname, 'current-add-lname': lname, 'current-add-sitename': '',
        'current-satid': '1', gender: '1', pan: customer.panNumber ?? '', 'referal-type': '', collection_date: '', assigned_user: '', outletid: [],
      };
      const operation = cuid ? 'update' : 'create';
      const stored = customer.sixorbitRaw && typeof customer.sixorbitRaw === 'object' && !Array.isArray(customer.sixorbitRaw)
        ? customer.sixorbitRaw as SearchRow : null;
      let address = existing ?? (value(stored?.id) === cuid ? stored : null);
      // Use the address identifier returned by SixOrbit, never its ledger alid.
      let addressId = value(address?.said);
      if (cuid && !addressId) {
        type AddressRow = { said?: string; stid?: string; satid?: string };
        const fetchAddress = async (): Promise<AddressRow | undefined> => {
          const addresses = await this.client.callOrThrow<{ address_list?: AddressRow[]; current_address_list?: AddressRow[]; site_address_list?: AddressRow[] }>({
            spec: SIXORBIT_TASKS.CUSTOMER_ADDRESS_LIST, params: { cuid },
            log: { entityType: 'CUSTOMER', entityId: customerId, externalId: cuid, direction: 'PULL' },
          });
          const current = Array.isArray(addresses.current_address_list) ? addresses.current_address_list : [];
          const all = Array.isArray(addresses.address_list) ? addresses.address_list : current;
          const sites = Array.isArray(addresses.site_address_list) ? addresses.site_address_list : [];
          const billingId = value(address?.baid);
          return (billingId ? [...current, ...all, ...sites].find((row) => value(row.said) === billingId) : undefined)
            ?? (current.length === 1 ? current[0] : undefined)
            ?? (current.length === 0 && all.length === 1 ? all[0] : undefined)
            ?? (current.length === 0 && all.length === 0 && sites.length === 1 ? sites[0] : undefined);
        };
        let selected = await fetchAddress();
        if (!selected) {
          await this.client.callOrThrow({
            spec: SIXORBIT_TASKS.ADD_CUSTOMER_ADDRESS,
            params: {
              cuid,
              'current-line1': customer.addressLine1 ?? '', 'current-line2': customer.addressLine2 ?? '',
              'current-area': customer.city ?? '', 'current-ctid': address?.billing_ctid ?? '1',
              'current-stid': customer.stateCode === '33' ? '24' : address?.billing_stid ?? '',
              'current-coverid': '', 'current-pincode': customer.pincode ?? '',
              'current-add-fname': fname, 'current-add-lname': lname,
              'current-add-mobile': phone, 'current-add-sitename': '', 'current-satid': '1',
            },
            log: { entityType: 'CUSTOMER', entityId: customerId, externalId: cuid, direction: 'PUSH' },
          });
          selected = await fetchAddress();
          if (!selected) {
            const refreshed = await findExisting();
            if (refreshed) address = { ...address, ...refreshed };
            addressId = value(refreshed?.said ?? refreshed?.baid);
          }
        }
        addressId ??= value(selected?.said);
        if (addressId) {
          address = { ...address, id: cuid, baid: value(address?.baid) ?? addressId, said: addressId };
          // Keep the resolved identifier so a later phone edit still uses this address.
          await this.prisma.customer.update({ where: { id: customerId }, data: { sixorbitRaw: address as Prisma.InputJsonValue } });
        }
      }
      if (cuid && !addressId) throw new Error('SixOrbit address ID is missing. Search and import the customer address before updating.');
      let written: { cuid?: string | number; alid?: string | number };
      try {
      written = await this.client.callOrThrow<{ cuid?: string | number; alid?: string | number }>({
        spec: operation === 'create' ? SIXORBIT_TASKS.ADD_CUSTOMER : SIXORBIT_TASKS.UPDATE_CUSTOMER, data: payload,
        log: { entityType: 'CUSTOMER', entityId: customerId, externalId: cuid, direction: 'PUSH' },
      });
      } catch (error) {
        if (error instanceof Error && /ledger name already exists/i.test(error.message)) {
          const found = await findExisting();
          if (found) return await adopt(found);
          throw new Error('Ledger Name Already Exists, but no matching customer was found by phone. Check the customer phone number in SixOrbit.');
        }
        throw error;
      }
      if (cuid && addressId) {
        await this.client.callOrThrow({
          spec: SIXORBIT_TASKS.UPDATE_CUSTOMER_ADDRESS,
          params: {
            cuid, said: addressId,
            'current-line1': customer.addressLine1 ?? '', 'current-line2': customer.addressLine2 ?? '',
            'current-ctid': address?.billing_ctid ?? '1',
            'current-stid': customer.stateCode === '33' ? '24' : address?.billing_stid ?? '',
            'current-coverid': '', 'current-pincode': customer.pincode ?? '',
            'current-add-fname': fname, 'current-add-lname': lname,
            'current-add-mobile': phone, 'current-add-sitename': '', 'current-satid': '1',
          },
          log: { entityType: 'CUSTOMER', entityId: customerId, externalId: cuid, direction: 'PUSH' },
        });
      }
      const sixorbitId = value(written.cuid) ?? cuid;
      if (!sixorbitId) throw new SixOrbitApiError('SixOrbit returned no customer id.', 'UNKNOWN');
      await this.prisma.customer.update({ where: { id: customerId }, data: {
        sixorbitId, sixorbitAlid: value(written.alid ?? existing?.alid ?? customer.sixorbitAlid),
        sixorbitCustomerNumber: value(existing?.customer_number ?? customer.sixorbitCustomerNumber), sixorbitCustomerCode: value(existing?.customer_code ?? customer.sixorbitCustomerCode),
        sixorbitSyncStatus: 'SYNCED', sixorbitSyncedAt: new Date(),
        sixorbitSyncError: null, sixorbitRaw: (address ?? existing ?? stored ?? written) as Prisma.InputJsonValue,
      }});
      return { customerId, operation, sixorbitId, adopted: Boolean(existing) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.customer.update({ where: { id: customerId }, data: { sixorbitSyncStatus: 'FAILED', sixorbitSyncError: message } });
      throw error;
    }
  }
}
