import { Inject } from '@nestjs/common';
import { CommandHandler, QueryHandler, type ICommandHandler, type IQueryHandler } from '@nestjs/cqrs';
import { NotFoundError, ValidationError } from '@tiles-erp/shared';
import type {
  CreateHandoverInput,
  DriverCashHandoverItem,
  DriverDueSummary,
  Paginated,
  PaginationQuery,
  UUID,
} from '@tiles-erp/shared-types';
import {
  DRIVER_CASH_REPOSITORY,
  type DriverCashRepository,
  type HandoverFilter,
  type ResolvedAllocation,
} from '../domain/driver-cash.repository';
import { allocateOldestFirst, round2 } from './dispatch.rules';

export class ListHandoversQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: HandoverFilter,
  ) {}
}

export class GetHandoverQuery {
  constructor(public readonly id: UUID) {}
}

export class DriverDueQuery {
  constructor(
    public readonly driverId?: UUID,
    public readonly driverName?: string,
    public readonly branchId?: UUID,
  ) {}
}

export class OutstandingDriversQuery {
  constructor(public readonly branchId?: UUID) {}
}

export class CreateHandoverCommand {
  constructor(
    public readonly data: CreateHandoverInput,
    public readonly actorId: UUID,
    public readonly actorName: string,
  ) {}
}

export class DeleteHandoverCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}

@QueryHandler(ListHandoversQuery)
export class ListHandoversHandler
  implements IQueryHandler<ListHandoversQuery, Paginated<DriverCashHandoverItem>>
{
  constructor(@Inject(DRIVER_CASH_REPOSITORY) private readonly cash: DriverCashRepository) {}

  execute(query: ListHandoversQuery): Promise<Paginated<DriverCashHandoverItem>> {
    return this.cash.list(query.pagination, query.filter);
  }
}

@QueryHandler(GetHandoverQuery)
export class GetHandoverHandler
  implements IQueryHandler<GetHandoverQuery, DriverCashHandoverItem>
{
  constructor(@Inject(DRIVER_CASH_REPOSITORY) private readonly cash: DriverCashRepository) {}

  async execute(query: GetHandoverQuery): Promise<DriverCashHandoverItem> {
    const handover = await this.cash.findById(query.id);
    if (!handover) throw new NotFoundError('Handover not found');
    return handover;
  }
}

@QueryHandler(DriverDueQuery)
export class DriverDueHandler implements IQueryHandler<DriverDueQuery, DriverDueSummary> {
  constructor(@Inject(DRIVER_CASH_REPOSITORY) private readonly cash: DriverCashRepository) {}

  execute(query: DriverDueQuery): Promise<DriverDueSummary> {
    return this.cash.driverDue(
      query.driverId ?? null,
      query.driverName ?? 'Not recorded',
      query.branchId,
    );
  }
}

@QueryHandler(OutstandingDriversQuery)
export class OutstandingDriversHandler
  implements IQueryHandler<OutstandingDriversQuery, DriverDueSummary[]>
{
  constructor(@Inject(DRIVER_CASH_REPOSITORY) private readonly cash: DriverCashRepository) {}

  execute(query: OutstandingDriversQuery): Promise<DriverDueSummary[]> {
    return this.cash.outstandingDrivers(query.branchId);
  }
}

@CommandHandler(CreateHandoverCommand)
export class CreateHandoverHandler
  implements ICommandHandler<CreateHandoverCommand, DriverCashHandoverItem>
{
  constructor(@Inject(DRIVER_CASH_REPOSITORY) private readonly cash: DriverCashRepository) {}

  /**
   * Records money coming off a driver.
   *
   * The trips it clears are worked out here rather than asked for: a driver settling at
   * the end of the day hands over one sum for three runs, and asking which note came from
   * which trip is theatre. Oldest first is what a counter does.
   */
  async execute(command: CreateHandoverCommand): Promise<DriverCashHandoverItem> {
    const amount = round2(command.data.amount);
    if (amount <= 0) throw new ValidationError('Enter the amount handed over');

    const due = await this.cash.driverDue(
      command.data.driverId ?? null,
      command.data.driverName?.trim() || 'Not recorded',
      command.data.branchId,
    );
    if (due.trips.length === 0) {
      throw new ValidationError('This driver has no trips with cash outstanding');
    }
    if (amount > due.balance + 0.005) {
      throw new ValidationError(
        `That is more than the ${due.balance} this driver is carrying`,
      );
    }

    let allocations: ResolvedAllocation[];
    if (command.data.allocations && command.data.allocations.length > 0) {
      const balances = new Map(due.trips.map((trip) => [trip.gatePassId, trip.balance]));
      allocations = command.data.allocations
        .filter((allocation) => allocation.amount > 0)
        .map((allocation) => {
          const balance = balances.get(allocation.gatePassId);
          if (balance === undefined) {
            throw new ValidationError('One of the trips has nothing outstanding on it');
          }
          if (allocation.amount > balance + 0.005) {
            throw new ValidationError(`That trip only has ${balance} outstanding`);
          }
          return { gatePassId: allocation.gatePassId, amount: round2(allocation.amount) };
        });

      const allocated = round2(
        allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
      );
      if (Math.abs(allocated - amount) > 0.005) {
        throw new ValidationError('The trips do not add up to the amount handed over');
      }
    } else {
      allocations = allocateOldestFirst(amount, due.trips);
    }

    const number = await this.cash.nextHandoverNumber(command.data.branchId);
    return this.cash.create(
      number,
      {
        branchId: command.data.branchId,
        driverId: command.data.driverId ?? null,
        driverName: due.driverName,
        handoverDate: command.data.handoverDate
          ? new Date(command.data.handoverDate)
          : new Date(),
        amount,
        remarks: command.data.remarks?.trim() || null,
        accountId: command.data.accountId ?? null,
        allocations,
      },
      command.actorId,
      command.actorName,
    );
  }
}

@CommandHandler(DeleteHandoverCommand)
export class DeleteHandoverHandler
  implements ICommandHandler<DeleteHandoverCommand, { success: true }>
{
  constructor(@Inject(DRIVER_CASH_REPOSITORY) private readonly cash: DriverCashRepository) {}

  async execute(command: DeleteHandoverCommand): Promise<{ success: true }> {
    await this.cash.softDelete(command.id, command.actorId);
    return { success: true };
  }
}
