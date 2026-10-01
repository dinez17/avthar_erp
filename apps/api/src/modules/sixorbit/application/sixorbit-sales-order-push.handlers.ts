import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ForbiddenError, NotFoundError } from '@tiles-erp/shared';
import type { AuthenticatedUser } from '@tiles-erp/shared-types';
import { SixOrbitSalesOrderPushService, type SixOrbitSalesOrderPushResult } from '@tiles-erp/sixorbit';
import { PrismaService } from '../../../core/prisma/prisma.service';

export class PushSalesOrderToSixOrbitCommand {
  constructor(public readonly salesInvoiceId: string, public readonly user: AuthenticatedUser) {}
}

@CommandHandler(PushSalesOrderToSixOrbitCommand)
export class PushSalesOrderToSixOrbitHandler implements ICommandHandler<PushSalesOrderToSixOrbitCommand, SixOrbitSalesOrderPushResult> {
  constructor(private readonly prisma: PrismaService, private readonly pusher: SixOrbitSalesOrderPushService) {}

  async execute(command: PushSalesOrderToSixOrbitCommand): Promise<SixOrbitSalesOrderPushResult> {
    const invoice = await this.prisma.salesInvoice.findFirst({ where: { id: command.salesInvoiceId, deletedAt: null }, select: { branchId: true } });
    if (!invoice) throw new NotFoundError('Sales invoice not found');
    const unrestricted = command.user.roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN');
    if (!unrestricted && !command.user.branchIds.includes(invoice.branchId)) throw new ForbiddenError('You are not assigned to this sales invoice branch.');
    return this.pusher.push(command.salesInvoiceId);
  }
}
