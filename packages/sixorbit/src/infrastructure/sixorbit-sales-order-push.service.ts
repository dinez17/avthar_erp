import type { PrismaClient } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '@tiles-erp/shared';
import { SIXORBIT_TASKS } from '../domain/sixorbit-task';
import type { SixOrbitClient } from './sixorbit.client';
import { SixOrbitCustomerPushService } from './sixorbit-customer-push.service';

interface OrderFormData {
  order_form_data?: {
    outlet?: Array<{ id?: string; name?: string; sale_alid?: string }>;
    ledgerInfo?: { alid?: string };
  };
  charges_list?: Array<{
    title?: string;
    ecid?: string;
    butapid?: string;
  }>;
  tax_list?: Array<{ butapid?: string; value?: string; tax_type?: string }>;
}

interface TemplateData { templates_Data?: Array<{ id?: string; title?: string }> }
interface CreateOrderData { chkoid?: string | number; order_id?: string | number }

export interface SixOrbitSalesOrderPushResult {
  salesInvoiceId: string;
  chkoid: string;
  orderId: string;
  message: string;
}

const text = (value: unknown): string => value === null || value === undefined ? '' : String(value).trim();
const normalize = (value: string): string => value.toLowerCase().replace(/\b(avthar|ceramics|branch|godown)\b/g, '').replace(/[^a-z0-9]/g, '');
const date = (value: Date): string => `${String(value.getUTCDate()).padStart(2, '0')}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${value.getUTCFullYear()}`;

export const sixOrbitInclusiveLineAmounts = (line: {
  qtyBoxes: unknown;
  lineTotal: unknown;
}) => {
  const quantity = Number(line.qtyBoxes);
  const total = Number(line.lineTotal);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(total)) {
    throw new ValidationError('Invoice line has an invalid quantity or total.');
  }
  return {
    price: String(Number((total / quantity).toFixed(8))),
    amount: String(total),
  };
};

interface SixOrbitPreCharge {
  id: string;
  value: string;
  charges: string;
}

/**
 * Maps ERP's invoice charges to the charge IDs returned by SixOrbit's live order form.
 * Some SixOrbit accounts, including Avthar's current setup, have Auto Freight and Loading
 * Charges but no separate Unloading charge. In that case unloading is added to Loading so
 * the full invoice value reaches SixOrbit. If an Unloading charge is later configured, it
 * is detected by title and sent on its own automatically.
 */
export const sixOrbitOrderCharges = (
  chargeDefinitions: OrderFormData['charges_list'],
  amounts: { freightCharge: unknown; loadingCharge: unknown; unloadingCharge: unknown },
): SixOrbitPreCharge[] => {
  const definitions = chargeDefinitions ?? [];
  const find = (pattern: RegExp) => definitions.find((item) => pattern.test(text(item.title)));
  const freight = find(/freight/i);
  const unloading = find(/unload/i);
  const loading = definitions.find(
    (item) => /load/i.test(text(item.title)) && !/unload/i.test(text(item.title)),
  );
  const values = {
    freight: Number(amounts.freightCharge ?? 0),
    loading: Number(amounts.loadingCharge ?? 0),
    unloading: Number(amounts.unloadingCharge ?? 0),
  };
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new ValidationError(`Invoice ${name} charge is invalid.`);
    }
  }

  const result: SixOrbitPreCharge[] = [];
  const add = (definition: (typeof definitions)[number] | undefined, value: number, label: string) => {
    if (value <= 0) return;
    const id = text(definition?.ecid);
    if (!id) throw new ValidationError(`SixOrbit order form has no ${label} charge.`);
    result.push({ id, value: value.toFixed(2), charges: text(definition?.butapid) || '0' });
  };

  add(freight, values.freight, 'Auto Freight');
  if (unloading) {
    add(loading, values.loading, 'Loading');
    add(unloading, values.unloading, 'Unloading');
  } else {
    add(loading, values.loading + values.unloading, 'Loading');
  }
  return result;
};

const DGL_OUTLET = { id: '410000352', name: 'AVTHAR CERAMICS, Dindigul' } as const;
const DGL_TAX_PROFILES: Record<string, string> = {
  '1:5': '410001919',
  '1:12': '410001942',
  '1:18': '410001923',
  '2:5': '410001943',
  '2:12': '410001920',
  '2:18': '410001921',
};

/** Creates one SixOrbit sales order from an ERP sales invoice. */
export class SixOrbitSalesOrderPushService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly client: SixOrbitClient,
    private readonly customerPusher: SixOrbitCustomerPushService,
  ) {}

  async push(salesInvoiceId: string): Promise<SixOrbitSalesOrderPushResult> {
    const loadInvoice = () => this.prisma.salesInvoice.findFirst({
      where: { id: salesInvoiceId, deletedAt: null },
      include: {
        branch: true,
        customer: true,
        lines: { include: { product: true } },
      },
    });
    let invoice = await loadInvoice();
    if (!invoice) throw new NotFoundError('Sales invoice not found');
    if (invoice.sixorbitId) {
      throw new ConflictError(`${invoice.invoiceNumber} is already linked to SixOrbit order ${invoice.sixorbitOrderId ?? invoice.sixorbitId}.`);
    }
    if (invoice.status !== 'POSTED') {
      throw new ValidationError('Post the sales invoice before pushing it to SixOrbit.');
    }
    if (invoice.lines.length === 0) throw new ValidationError('The sales invoice has no lines.');

    try {
      const customerRaw = (invoice.customer.sixorbitRaw as Record<string, unknown> | null) ?? {};
      const customerNeedsSync = invoice.customer.sixorbitSyncStatus !== 'SYNCED'
        || !invoice.customer.sixorbitId
        || !invoice.customer.sixorbitAlid
        || !text(customerRaw.baid)
        || !(text(customerRaw.said) || text(customerRaw.baid));
      if (customerNeedsSync) {
        await this.customerPusher.push(invoice.customerId);
        const refreshed = await loadInvoice();
        if (!refreshed) throw new NotFoundError('Sales invoice not found after customer sync.');
        invoice = refreshed;
      }
      if (!invoice.customer.sixorbitId || !invoice.customer.sixorbitAlid) {
        throw new ValidationError('SixOrbit customer sync completed without a usable customer or ledger ID.');
      }

      const branchKey = normalize(`${invoice.branch.code} ${invoice.branch.name} ${invoice.branch.city ?? ''}`);
      const requestedOutletId = branchKey.includes('dgl') || branchKey.includes('dindigul') ? '410000352' : undefined;
      const [form, config] = await Promise.all([
        this.client.callOrThrow<OrderFormData>({
          spec: SIXORBIT_TASKS.FETCH_ORDER_FORM_DATA,
          ...(requestedOutletId ? { params: { outlid: requestedOutletId } } : {}),
          log: { entityType: 'SALES_INVOICE', entityId: invoice.id, direction: 'PULL' },
        }),
        this.prisma.sixOrbitConfig.findFirst({ where: { deletedAt: null, isActive: true }, orderBy: { createdAt: 'asc' } }),
      ]);

      const outlets = form.order_form_data?.outlet ?? [];
      const branchKeys = [invoice.branch.name, invoice.branch.city ?? '', invoice.branch.code].map(normalize).filter(Boolean);
      const liveOutlet = outlets.find((candidate) => {
        const key = normalize(candidate.name ?? '');
        return branchKeys.some((branchKey) => key.includes(branchKey) || branchKey.includes(key));
      });
      // SixOrbit's form-data endpoint is tied to the web session's current outlet and can
      // return an unrelated outlet even when outlid is supplied. DGL's IDs are confirmed
      // from its live order form and a working create-order payload, so use that mapping
      // only for DGL when the session response omits it.
      const outlet = liveOutlet ?? (requestedOutletId === DGL_OUTLET.id ? DGL_OUTLET : undefined);
      if (!outlet?.id) throw new ValidationError(`No matching SixOrbit outlet was found for branch ${invoice.branch.name}.`);

      const templateOutcome = await this.client.call<TemplateData>({
        spec: SIXORBIT_TASKS.FETCH_ORDER_TEMPLATES,
        params: { outlid: outlet.id },
        log: { entityType: 'SALES_INVOICE', entityId: invoice.id, direction: 'PULL' },
      });
      const liveTemplate = templateOutcome.ok
        ? (templateOutcome.data.templates_Data ?? []).find((item) => normalize(item.title ?? '') === 'salesorder')
        : undefined;
      // SixOrbit previously returned this Sales Order template for the DGL outlet. Its
      // template lookup is session-outlet dependent, so retain that confirmed mapping
      // only for DGL; every other outlet must provide its own live template.
      const template = liveTemplate ?? (outlet.id === '410000352' ? { id: '410000089', title: 'Sales Order' } : undefined);
      if (!template?.id) throw new ValidationError(`SixOrbit did not return a Sales Order template for ${invoice.branch.name}.`);
      const uid = config?.tokenUserId;
      if (!uid) throw new ValidationError('SixOrbit has no active authenticated user. Test the connection and retry.');

      const syncedCustomerRaw = (invoice.customer.sixorbitRaw as Record<string, unknown> | null) ?? {};
      const billingAddressId = text(syncedCustomerRaw.baid);
      const shippingAddressId = text(syncedCustomerRaw.said) || billingAddressId;
      if (!billingAddressId || !shippingAddressId) {
        throw new ValidationError('SixOrbit billing or shipping address ID is missing. Sync the customer again before pushing this invoice.');
      }

      const interState = Boolean(invoice.branch.stateCode && invoice.customer.stateCode && invoice.branch.stateCode !== invoice.customer.stateCode);
      const cart = invoice.lines.map((line) => {
        if (!line.product.sixorbitId) throw new ValidationError(`Sync product ${line.product.sku} with SixOrbit before pushing the order.`);
        const raw = (line.product.sixorbitRaw as Record<string, unknown> | null) ?? {};
        const iid = text(raw.iid ?? raw.item_id);
        const taxType = interState ? '2' : '1';
        const tax = (form.tax_list ?? []).find((item) => Number(item.value) === Number(line.gstRate) && item.tax_type === taxType);
        const taxProfileId = text(tax?.butapid) || (outlet.id === DGL_OUTLET.id
          ? DGL_TAX_PROFILES[`${taxType}:${Number(line.gstRate)}`]
          : '');
        if (!taxProfileId) throw new ValidationError(`SixOrbit has no ${interState ? 'IGST' : 'GST'} ${Number(line.gstRate)}% tax profile.`);
        const meaid = line.product.baseUom === 'PIECE' ? '27' : text(raw.package_meaid) || '40';
        // SixOrbit's sales-order form treats `price` and `amount` as GST-inclusive.
        // ERP freezes the authoritative inclusive value in lineTotal, so derive the
        // unit price from it instead of sending the pre-GST `rate`/lineSubTotal.
        const inclusive = sixOrbitInclusiveLineAmounts(line);
        return {
          // Their public variation feed exposes isvid but not iid. The create endpoint
          // accepts the stable variation id as the product identity; iid is included when
          // a future feed supplies it and otherwise deliberately left blank.
          iitid: '1', isvid: line.product.sixorbitId, iid,
          name: line.product.name, meaid, price_meaid: meaid,
          quantity: String(Number(line.qtyBoxes)), price: inclusive.price, dealer_price: 'null',
          amount: inclusive.amount, measurements: meaid === '27' ? 'PCS' : 'Box',
          taxes: '', butapid: taxProfileId, tax: String(Number(line.gstRate)),
          price_conversion_rate: '1.00000000', conversion_rate: '1.00000000',
          box_conversion_rate: '1', box_qty: String(Number(line.qtyBoxes)), image: '',
          discount: '0.00', discount_type: '1', product_attributes: '', description: '',
          type: '1', roundoff: '0', item_service: '0', price_unit_conversion_rate: '1.0',
          quantity_unit_conversion_rate: '1.0', remark: '', price_variation_id_item: '19',
        };
      });

      const invoiceDate = date(invoice.invoiceDate);
      const preCharge = sixOrbitOrderCharges(form.charges_list, {
        freightCharge: invoice.freightCharge,
        loadingCharge: invoice.loadingCharge,
        unloadingCharge: invoice.unloadingCharge,
      });
      const payload = {
        uid, baid: billingAddressId, said: shippingAddressId, cc: '',
        cuid: invoice.customer.sixorbitId, dealer_price: '1', chkid: outlet.id, etid: '',
        ortemid: template.id, smstid: '', discount: '0', discount_type: '1', mail: '0', sms: '0',
        attributes: '', checkpoint_order_remarks: [invoice.invoiceNumber, invoice.remarks].filter(Boolean).join(' · '),
        round: String(Number(invoice.roundOff)), round_field: '0', 'payment-terms': 1,
        category_type: '2', price_variation_id_main: '19', day: '', advance_payment: '0',
        payment_mode: '', payment: '', advance_amount: '0', payment_attrs: '', custid: '1',
        // SixOrbit expects the customer's ledger account here. outlet.sale_alid is the
        // sales ledger used by the web form and produced orders that were not visible for
        // this customer.
        alid: invoice.customer.sixorbitAlid, order_type: '1',
        'percent-limit': '', order_no: '', date: invoiceDate,
        due_date: invoice.dueDate ? date(invoice.dueDate) : '',
        delivery_date: invoice.dueDate ? date(invoice.dueDate) : invoiceDate, create_date: invoiceDate,
        shipping_type: '0', trid: '', t_name: '', cart, pre_charge: preCharge, material_tax: '',
        post_charge: [], extra_discount: [], bit: '1', charge: [], charges: '',
      };

      const response = await this.client.callOrThrow<CreateOrderData>({
        spec: SIXORBIT_TASKS.CREATE_ORDER,
        data: payload,
        log: { entityType: 'SALES_INVOICE', entityId: invoice.id, direction: 'PUSH' },
      });
      const chkoid = text(response.chkoid);
      const orderId = text(response.order_id);
      if (!chkoid || !orderId || orderId === 'NA') {
        throw new ValidationError('SixOrbit accepted the request but returned no usable chkoid/order_id.');
      }
      await this.prisma.salesInvoice.update({
        where: { id: invoice.id },
        data: { sixorbitId: chkoid, sixorbitOrderId: orderId, sixorbitSyncStatus: 'SYNCED', sixorbitSyncedAt: new Date(), sixorbitSyncError: null, sixorbitRaw: JSON.parse(JSON.stringify(response)) },
      });
      return { salesInvoiceId: invoice.id, chkoid, orderId, message: `Created SixOrbit order ${orderId}.` };
    } catch (error) {
      await this.prisma.salesInvoice.update({ where: { id: invoice.id }, data: { sixorbitSyncStatus: 'FAILED', sixorbitSyncError: error instanceof Error ? error.message : String(error) } });
      throw error;
    }
  }
}
