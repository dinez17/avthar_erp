import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { REGEX } from '@tiles-erp/config';
import type { CustomerType } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

const CUSTOMER_TYPES: CustomerType[] = ['RETAIL', 'WHOLESALE', 'DEALER', 'PROJECT'];

class PartyContactDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  contactPerson?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @Matches(/^[+]?\d{7,15}$/, { message: 'phone must be 7-15 digits, optionally prefixed with +' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @Matches(/^[+]?\d{7,15}$/, { message: 'altPhone must be 7-15 digits' })
  @IsOptional()
  altPhone?: string;

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
  @MaxLength(200)
  @IsOptional()
  addressLine2?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: '33', description: 'Official 2-digit GST state code' })
  @Matches(/^\d{2}$/, { message: 'stateCode must be a 2-digit GST state code' })
  @IsOptional()
  stateCode?: string;

  @ApiPropertyOptional({ example: '600001' })
  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit PIN code' })
  @IsOptional()
  pincode?: string;
}

export class CreatePartyDto extends PartyContactDto {
  @ApiPropertyOptional({ description: 'Left blank, a sequential code is generated' })
  @IsString()
  @MaxLength(32)
  @IsOptional()
  code?: string;

  @ApiProperty({ example: 'Sri Balaji Traders' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: '33AAPFU0939F1ZV' })
  @Matches(REGEX.GSTIN, { message: 'gstin must be a valid GSTIN' })
  @IsOptional()
  gstin?: string;

  @ApiPropertyOptional({ example: 'AAPFU0939F' })
  @Matches(/^[A-Z]{5}\d{4}[A-Z]$/i, { message: 'panNumber must be a valid PAN' })
  @IsOptional()
  panNumber?: string;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  openingBalance?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  // ---- customer-only ----
  @ApiPropertyOptional({ enum: CUSTOMER_TYPES, default: 'RETAIL' })
  @IsIn(CUSTOMER_TYPES)
  @IsOptional()
  type?: CustomerType;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  creditDays?: number;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  creditLimit?: number;

  // ---- supplier-only ----
  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  paymentTermDays?: number;
}

export class UpdatePartyDto extends CreatePartyDto {
  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class PartyListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ example: '33' })
  @Matches(/^\d{2}$/)
  @IsOptional()
  stateCode?: string;
}
