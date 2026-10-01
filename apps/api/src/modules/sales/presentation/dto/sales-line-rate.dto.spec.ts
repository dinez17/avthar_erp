import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SalesInvoiceLineDto } from './sales-invoice.dto';
import { SalesOrderLineDto } from './sales-order.dto';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';
const GODOWN_ID = '22222222-2222-4222-8222-222222222222';

describe('sales line rate validation', () => {
  it('accepts the precise order rate when creating an invoice', () => {
    const line = plainToInstance(SalesInvoiceLineDto, {
      productId: PRODUCT_ID,
      godownId: GODOWN_ID,
      boxes: 10,
      rate: 355.93220339,
    });
    expect(validateSync(line)).toEqual([]);
  });

  it('accepts the same rate when creating a sales order', () => {
    const line = plainToInstance(SalesOrderLineDto, {
      productId: PRODUCT_ID,
      boxes: 10,
      rate: 355.93220339,
    });
    expect(validateSync(line)).toEqual([]);
  });
});
