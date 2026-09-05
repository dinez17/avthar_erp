import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { getGstState, isGstStateCode } from '@tiles-erp/config';
import { ConflictError, ValidationError } from '@tiles-erp/shared';
import type {
  CreateDriverInput,
  CreateTransporterInput,
  CreateVehicleInput,
  DriverItem,
  Paginated,
  PaginationQuery,
  TransporterItem,
  UpdateDriverInput,
  UpdateTransporterInput,
  UpdateVehicleInput,
  UUID,
  VehicleItem,
} from '@tiles-erp/shared-types';
import {
  DRIVER_REPOSITORY,
  TRANSPORTER_REPOSITORY,
  VEHICLE_REPOSITORY,
  type DriverRepository,
  type LogisticsListFilter,
  type TransporterRepository,
  type VehicleRepository,
} from '../domain/logistics.repositories';

// ---- queries ----
export class ListTransportersQuery {
  constructor(public readonly pagination: PaginationQuery) {}
}
export class NextTransporterCodeQuery {}
export class ListVehiclesQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: LogisticsListFilter,
  ) {}
}
export class ListDriversQuery {
  constructor(
    public readonly pagination: PaginationQuery,
    public readonly filter: LogisticsListFilter,
  ) {}
}
export class NextDriverCodeQuery {}

// ---- commands ----
export class CreateTransporterCommand {
  constructor(
    public readonly data: CreateTransporterInput,
    public readonly actorId: UUID,
  ) {}
}
export class UpdateTransporterCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateTransporterInput,
    public readonly actorId: UUID,
  ) {}
}
export class DeleteTransporterCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}
export class CreateVehicleCommand {
  constructor(
    public readonly data: CreateVehicleInput,
    public readonly actorId: UUID,
  ) {}
}
export class UpdateVehicleCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateVehicleInput,
    public readonly actorId: UUID,
  ) {}
}
export class DeleteVehicleCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}
export class CreateDriverCommand {
  constructor(
    public readonly data: CreateDriverInput,
    public readonly actorId: UUID,
  ) {}
}
export class UpdateDriverCommand {
  constructor(
    public readonly id: UUID,
    public readonly data: UpdateDriverInput,
    public readonly actorId: UUID,
  ) {}
}
export class DeleteDriverCommand {
  constructor(
    public readonly id: UUID,
    public readonly actorId: UUID,
  ) {}
}

/** Applies the shared GSTIN/state agreement used across every master. */
function normaliseTransporter<T extends CreateTransporterInput | UpdateTransporterInput>(
  data: T,
): T {
  const stateCode = data.stateCode?.trim();
  if (stateCode && !isGstStateCode(stateCode)) {
    throw new ValidationError(`Unknown GST state code "${stateCode}"`);
  }
  const gstin = data.gstin?.trim().toUpperCase();
  if (gstin && stateCode && !gstin.startsWith(stateCode)) {
    throw new ValidationError(
      `GSTIN state code (${gstin.slice(0, 2)}) does not match the selected state (${stateCode})`,
    );
  }
  return {
    ...data,
    name: data.name?.trim(),
    code: data.code?.trim().toUpperCase(),
    gstin,
    stateCode,
    ...(stateCode ? { state: getGstState(stateCode)?.name } : {}),
  } as T;
}

/** Vehicle registration numbers are stored uppercase without separators. */
const normaliseVehicleNumber = (value: string): string =>
  value.trim().toUpperCase().replace(/[\s-]/g, '');

// ---- transporter handlers ----
@QueryHandler(ListTransportersQuery)
export class ListTransportersHandler
  implements IQueryHandler<ListTransportersQuery, Paginated<TransporterItem>>
{
  constructor(@Inject(TRANSPORTER_REPOSITORY) private readonly repo: TransporterRepository) {}

  execute(query: ListTransportersQuery): Promise<Paginated<TransporterItem>> {
    return this.repo.list(query.pagination);
  }
}

@QueryHandler(NextTransporterCodeQuery)
export class NextTransporterCodeHandler implements IQueryHandler<NextTransporterCodeQuery, string> {
  constructor(@Inject(TRANSPORTER_REPOSITORY) private readonly repo: TransporterRepository) {}

  execute(): Promise<string> {
    return this.repo.nextCode();
  }
}

@CommandHandler(CreateTransporterCommand)
export class CreateTransporterHandler
  implements ICommandHandler<CreateTransporterCommand, TransporterItem>
{
  constructor(@Inject(TRANSPORTER_REPOSITORY) private readonly repo: TransporterRepository) {}

  async execute(command: CreateTransporterCommand): Promise<TransporterItem> {
    const data = normaliseTransporter(command.data);
    const code = data.code || (await this.repo.nextCode());
    if (await this.repo.codeExists(code)) {
      throw new ConflictError(`Transporter code "${code}" is already in use`);
    }
    return this.repo.create({ ...data, code, createdBy: command.actorId });
  }
}

@CommandHandler(UpdateTransporterCommand)
export class UpdateTransporterHandler
  implements ICommandHandler<UpdateTransporterCommand, TransporterItem>
{
  constructor(@Inject(TRANSPORTER_REPOSITORY) private readonly repo: TransporterRepository) {}

  async execute(command: UpdateTransporterCommand): Promise<TransporterItem> {
    const data = normaliseTransporter(command.data);
    if (data.code && (await this.repo.codeExists(data.code, command.id))) {
      throw new ConflictError(`Transporter code "${data.code}" is already in use`);
    }
    return this.repo.update(command.id, { ...data, updatedBy: command.actorId });
  }
}

@CommandHandler(DeleteTransporterCommand)
export class DeleteTransporterHandler implements ICommandHandler<DeleteTransporterCommand, void> {
  constructor(@Inject(TRANSPORTER_REPOSITORY) private readonly repo: TransporterRepository) {}

  execute(command: DeleteTransporterCommand): Promise<void> {
    return this.repo.softDelete(command.id, command.actorId);
  }
}

// ---- vehicle handlers ----
@QueryHandler(ListVehiclesQuery)
export class ListVehiclesHandler
  implements IQueryHandler<ListVehiclesQuery, Paginated<VehicleItem>>
{
  constructor(@Inject(VEHICLE_REPOSITORY) private readonly repo: VehicleRepository) {}

  execute(query: ListVehiclesQuery): Promise<Paginated<VehicleItem>> {
    return this.repo.list(query.pagination, query.filter);
  }
}

@CommandHandler(CreateVehicleCommand)
export class CreateVehicleHandler implements ICommandHandler<CreateVehicleCommand, VehicleItem> {
  constructor(@Inject(VEHICLE_REPOSITORY) private readonly repo: VehicleRepository) {}

  async execute(command: CreateVehicleCommand): Promise<VehicleItem> {
    const number = normaliseVehicleNumber(command.data.number);
    if (!number) throw new ValidationError('Vehicle number is required');
    if (command.data.ownership === 'HIRED' && !command.data.transporterId) {
      throw new ValidationError('A hired vehicle must be linked to a transporter');
    }
    if (await this.repo.numberExists(number)) {
      throw new ConflictError(`Vehicle "${number}" is already registered`);
    }
    return this.repo.create({ ...command.data, number, createdBy: command.actorId });
  }
}

@CommandHandler(UpdateVehicleCommand)
export class UpdateVehicleHandler implements ICommandHandler<UpdateVehicleCommand, VehicleItem> {
  constructor(@Inject(VEHICLE_REPOSITORY) private readonly repo: VehicleRepository) {}

  async execute(command: UpdateVehicleCommand): Promise<VehicleItem> {
    const number = command.data.number ? normaliseVehicleNumber(command.data.number) : undefined;
    if (command.data.ownership === 'HIRED' && command.data.transporterId === null) {
      throw new ValidationError('A hired vehicle must be linked to a transporter');
    }
    if (number && (await this.repo.numberExists(number, command.id))) {
      throw new ConflictError(`Vehicle "${number}" is already registered`);
    }
    return this.repo.update(command.id, {
      ...command.data,
      ...(number ? { number } : {}),
      updatedBy: command.actorId,
    });
  }
}

@CommandHandler(DeleteVehicleCommand)
export class DeleteVehicleHandler implements ICommandHandler<DeleteVehicleCommand, void> {
  constructor(@Inject(VEHICLE_REPOSITORY) private readonly repo: VehicleRepository) {}

  execute(command: DeleteVehicleCommand): Promise<void> {
    return this.repo.softDelete(command.id, command.actorId);
  }
}

// ---- driver handlers ----
@QueryHandler(ListDriversQuery)
export class ListDriversHandler implements IQueryHandler<ListDriversQuery, Paginated<DriverItem>> {
  constructor(@Inject(DRIVER_REPOSITORY) private readonly repo: DriverRepository) {}

  execute(query: ListDriversQuery): Promise<Paginated<DriverItem>> {
    return this.repo.list(query.pagination, query.filter);
  }
}

@QueryHandler(NextDriverCodeQuery)
export class NextDriverCodeHandler implements IQueryHandler<NextDriverCodeQuery, string> {
  constructor(@Inject(DRIVER_REPOSITORY) private readonly repo: DriverRepository) {}

  execute(): Promise<string> {
    return this.repo.nextCode();
  }
}

@CommandHandler(CreateDriverCommand)
export class CreateDriverHandler implements ICommandHandler<CreateDriverCommand, DriverItem> {
  constructor(@Inject(DRIVER_REPOSITORY) private readonly repo: DriverRepository) {}

  async execute(command: CreateDriverCommand): Promise<DriverItem> {
    const phone = command.data.phone?.trim();
    if (!phone) throw new ValidationError('Driver phone number is required');
    const code = command.data.code?.trim().toUpperCase() || (await this.repo.nextCode());
    if (await this.repo.codeExists(code)) {
      throw new ConflictError(`Driver code "${code}" is already in use`);
    }
    return this.repo.create({
      ...command.data,
      code,
      phone,
      name: command.data.name.trim(),
      createdBy: command.actorId,
    });
  }
}

@CommandHandler(UpdateDriverCommand)
export class UpdateDriverHandler implements ICommandHandler<UpdateDriverCommand, DriverItem> {
  constructor(@Inject(DRIVER_REPOSITORY) private readonly repo: DriverRepository) {}

  async execute(command: UpdateDriverCommand): Promise<DriverItem> {
    if (command.data.phone !== undefined && !command.data.phone.trim()) {
      throw new ValidationError('Driver phone number is required');
    }
    const code = command.data.code?.trim().toUpperCase();
    if (code && (await this.repo.codeExists(code, command.id))) {
      throw new ConflictError(`Driver code "${code}" is already in use`);
    }
    return this.repo.update(command.id, {
      ...command.data,
      ...(code ? { code } : {}),
      updatedBy: command.actorId,
    });
  }
}

@CommandHandler(DeleteDriverCommand)
export class DeleteDriverHandler implements ICommandHandler<DeleteDriverCommand, void> {
  constructor(@Inject(DRIVER_REPOSITORY) private readonly repo: DriverRepository) {}

  execute(command: DeleteDriverCommand): Promise<void> {
    return this.repo.softDelete(command.id, command.actorId);
  }
}
