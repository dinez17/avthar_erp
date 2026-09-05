import type { ISODateString, UUID } from './common';

export type VehicleType = 'TRUCK' | 'TEMPO' | 'TRAILER' | 'PICKUP' | 'CONTAINER';
export type VehicleOwnership = 'OWNED' | 'HIRED';

export interface TransporterItem {
  id: UUID;
  code: string;
  name: string;
  gstin: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  pincode: string | null;
  vehicleCount: number;
  driverCount: number;
  isActive: boolean;
  notes: string | null;
  version: number;
}

export interface VehicleItem {
  id: UUID;
  number: string;
  type: VehicleType;
  ownership: VehicleOwnership;
  transporterId: UUID | null;
  transporterName: string | null;
  capacityTons: number | null;
  make: string | null;
  insuranceExpiry: ISODateString | null;
  fitnessExpiry: ISODateString | null;
  isActive: boolean;
  notes: string | null;
  version: number;
}

export interface DriverItem {
  id: UUID;
  code: string;
  name: string;
  phone: string;
  altPhone: string | null;
  licenseNumber: string | null;
  licenseExpiry: ISODateString | null;
  transporterId: UUID | null;
  transporterName: string | null;
  addressLine1: string | null;
  city: string | null;
  isActive: boolean;
  notes: string | null;
  version: number;
}

export interface CreateTransporterInput {
  code?: string;
  name: string;
  gstin?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  stateCode?: string;
  /** Derived from stateCode by the API; not set directly by clients. */
  state?: string;
  pincode?: string;
  notes?: string;
  isActive?: boolean;
}
export interface UpdateTransporterInput extends Partial<CreateTransporterInput> {
  version: number;
}

export interface CreateVehicleInput {
  number: string;
  type?: VehicleType;
  ownership?: VehicleOwnership;
  transporterId?: UUID | null;
  capacityTons?: number;
  make?: string;
  insuranceExpiry?: ISODateString;
  fitnessExpiry?: ISODateString;
  notes?: string;
  isActive?: boolean;
}
export interface UpdateVehicleInput extends Partial<CreateVehicleInput> {
  version: number;
}

export interface CreateDriverInput {
  code?: string;
  name: string;
  phone: string;
  altPhone?: string;
  licenseNumber?: string;
  licenseExpiry?: ISODateString;
  transporterId?: UUID | null;
  addressLine1?: string;
  city?: string;
  notes?: string;
  isActive?: boolean;
}
export interface UpdateDriverInput extends Partial<CreateDriverInput> {
  version: number;
}
