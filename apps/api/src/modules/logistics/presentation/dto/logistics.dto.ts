import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { REGEX } from '@tiles-erp/config';
import type { VehicleOwnership, VehicleType } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

const VEHICLE_TYPES: VehicleType[] = ['TRUCK', 'TEMPO', 'TRAILER', 'PICKUP', 'CONTAINER'];
const OWNERSHIPS: VehicleOwnership[] = ['OWNED', 'HIRED'];

export class LogisticsListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  transporterId?: string;
}

export class CreateTransporterDto {
  @ApiPropertyOptional({ description: 'Left blank, a sequential code is generated' })
  @IsString()
  @MaxLength(32)
  @IsOptional()
  code?: string;

  @ApiProperty({ example: 'VRL Logistics' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: '33AAPFU0939F1ZV' })
  @Matches(REGEX.GSTIN, { message: 'gstin must be a valid GSTIN' })
  @IsOptional()
  gstin?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  contactPerson?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @Matches(/^[+]?\d{7,15}$/, { message: 'phone must be 7-15 digits' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ format: 'email' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: '33' })
  @Matches(/^\d{2}$/, { message: 'stateCode must be a 2-digit GST state code' })
  @IsOptional()
  stateCode?: string;

  @ApiPropertyOptional({ example: '600001' })
  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit PIN code' })
  @IsOptional()
  pincode?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateTransporterDto extends CreateTransporterDto {
  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CreateVehicleDto {
  @ApiProperty({ example: 'TN01AB1234' })
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  number!: string;

  @ApiPropertyOptional({ enum: VEHICLE_TYPES, default: 'TRUCK' })
  @IsIn(VEHICLE_TYPES)
  @IsOptional()
  type?: VehicleType;

  @ApiPropertyOptional({ enum: OWNERSHIPS, default: 'OWNED' })
  @IsIn(OWNERSHIPS)
  @IsOptional()
  ownership?: VehicleOwnership;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID('4')
  @IsOptional()
  transporterId?: string;

  @ApiPropertyOptional({ example: 9.5, minimum: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  capacityTons?: number;

  @ApiPropertyOptional({ example: 'Tata 1109' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  make?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  insuranceExpiry?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  fitnessExpiry?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateVehicleDto extends CreateVehicleDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(20)
  @IsOptional()
  declare number: string;

  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CreateDriverDto {
  @ApiPropertyOptional({ description: 'Left blank, a sequential code is generated' })
  @IsString()
  @MaxLength(32)
  @IsOptional()
  code?: string;

  @ApiProperty({ example: 'Ramesh Kumar' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ example: '+919876543210' })
  @Matches(/^[+]?\d{7,15}$/, { message: 'phone must be 7-15 digits' })
  phone!: string;

  @ApiPropertyOptional()
  @Matches(/^[+]?\d{7,15}$/, { message: 'altPhone must be 7-15 digits' })
  @IsOptional()
  altPhone?: string;

  @ApiPropertyOptional({ example: 'TN0120110001234' })
  @IsString()
  @MaxLength(32)
  @IsOptional()
  licenseNumber?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  licenseExpiry?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsUUID('4')
  @IsOptional()
  transporterId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateDriverDto extends CreateDriverDto {
  @ApiPropertyOptional()
  @Matches(/^[+]?\d{7,15}$/, { message: 'phone must be 7-15 digits' })
  @IsOptional()
  declare phone: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  @IsOptional()
  declare name: string;

  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
