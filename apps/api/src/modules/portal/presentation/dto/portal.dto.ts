import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { PortalPartyType } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

const PARTY_TYPES: PortalPartyType[] = ['SUPPLIER', 'CUSTOMER'];

export class CreatePortalAccountDto {
  @ApiProperty({ enum: PARTY_TYPES })
  @IsIn(PARTY_TYPES)
  partyType!: PortalPartyType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required when partyType is SUPPLIER' })
  @IsUUID('4')
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required when partyType is CUSTOMER' })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;

  @ApiProperty({ format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Ramesh Kumar' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({ description: 'Omitted, a temporary password is generated' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @IsOptional()
  password?: string;
}

export class SetPortalAccountActiveDto {
  @ApiProperty()
  @IsBoolean()
  isActive!: boolean;
}

export class PortalAccountListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PARTY_TYPES })
  @IsIn(PARTY_TYPES)
  @IsOptional()
  partyType?: PortalPartyType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional()
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class AcknowledgeOrderDto {
  @ApiProperty({ enum: ['ACKNOWLEDGED', 'QUERIED'] })
  @IsIn(['ACKNOWLEDGED', 'QUERIED'])
  decision!: 'ACKNOWLEDGED' | 'QUERIED';

  @ApiPropertyOptional({ description: 'Required when raising a query' })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note?: string;
}

export class RaiseSupplierPoLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ example: 20, description: 'Boxes offered' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  boxes!: number;

  @ApiProperty({ example: 1250 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rate!: number;

  @ApiPropertyOptional({ description: "Defaults to the product's GST rate" })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(28)
  @IsOptional()
  gstRate?: number;
}

export class RaiseSupplierPoDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  expectedDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  remarks?: string;

  @ApiProperty({ type: [RaiseSupplierPoLineDto], maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RaiseSupplierPoLineDto)
  lines!: RaiseSupplierPoLineDto[];
}
