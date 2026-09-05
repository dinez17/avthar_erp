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

export const TRANSPORTER_REPOSITORY = Symbol('TRANSPORTER_REPOSITORY');
export const VEHICLE_REPOSITORY = Symbol('VEHICLE_REPOSITORY');
export const DRIVER_REPOSITORY = Symbol('DRIVER_REPOSITORY');

export interface LogisticsListFilter {
  transporterId?: UUID;
  isActive?: boolean;
}

export interface TransporterRepository {
  list(query: PaginationQuery): Promise<Paginated<TransporterItem>>;
  nextCode(): Promise<string>;
  codeExists(code: string, excludeId?: UUID): Promise<boolean>;
  create(data: CreateTransporterInput & { code: string; createdBy: UUID }): Promise<TransporterItem>;
  update(id: UUID, data: UpdateTransporterInput & { updatedBy: UUID }): Promise<TransporterItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
}

export interface VehicleRepository {
  list(query: PaginationQuery, filter: LogisticsListFilter): Promise<Paginated<VehicleItem>>;
  numberExists(number: string, excludeId?: UUID): Promise<boolean>;
  create(data: CreateVehicleInput & { createdBy: UUID }): Promise<VehicleItem>;
  update(id: UUID, data: UpdateVehicleInput & { updatedBy: UUID }): Promise<VehicleItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
}

export interface DriverRepository {
  list(query: PaginationQuery, filter: LogisticsListFilter): Promise<Paginated<DriverItem>>;
  nextCode(): Promise<string>;
  codeExists(code: string, excludeId?: UUID): Promise<boolean>;
  create(data: CreateDriverInput & { code: string; createdBy: UUID }): Promise<DriverItem>;
  update(id: UUID, data: UpdateDriverInput & { updatedBy: UUID }): Promise<DriverItem>;
  softDelete(id: UUID, deletedBy: UUID): Promise<void>;
}
