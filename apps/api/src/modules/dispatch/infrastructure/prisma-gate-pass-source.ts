import { Injectable } from '@nestjs/common';
import type { UUID } from '@tiles-erp/shared-types';
import { PrismaService } from '../../../core/prisma/prisma.service';
import type {
  DispatchableInvoice,
  DispatchableTransfer,
  DispatchDriver,
  DispatchProduct,
  DispatchVehicle,
  GatePassSource,
} from '../domain/gate-pass-source';

@Injectable()
export class PrismaGatePassSource implements GatePassSource {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Only a posted invoice can be dispatched. A draft has not taken the stock out yet, and
   * a cancelled one never did — letting either through the gate would put goods on the
   * road that the ledger says are still in the godown.
   */
  async invoiceForDispatch(id: UUID): Promise<DispatchableInvoice | null> {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, deletedAt: null, status: 'POSTED' },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        customerId: true,
        customerName: true,
        customerAddress: true,
        branchId: true,
        grandTotal: true,
        freightCharge: true,
      },
    });
    return invoice
      ? {
          ...invoice,
          grandTotal: Number(invoice.grandTotal),
          freightCharge: Number(invoice.freightCharge),
        }
      : null;
  }

  transferForDispatch(id: UUID): Promise<DispatchableTransfer | null> {
    return this.prisma.stockTransfer.findFirst({
      where: { id },
      select: { id: true, transferNo: true, transferDate: true },
    });
  }

  productForLine(id: UUID): Promise<DispatchProduct | null> {
    return this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, sku: true, piecesPerBox: true },
    });
  }

  vehicle(id: UUID): Promise<DispatchVehicle | null> {
    return this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, number: true, transporterId: true },
    });
  }

  driver(id: UUID): Promise<DispatchDriver | null> {
    return this.prisma.driver.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, phone: true, transporterId: true },
    });
  }

  transporter(id: UUID): Promise<{ id: UUID; name: string } | null> {
    return this.prisma.transporter.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true },
    });
  }
}
