import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
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
import type { SalesOrderStatus } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

const STATUSES: SalesOrderStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'PARTIALLY_INVOICED',
  'INVOICED',
  'CANCELLED',
];

export class SalesOrderLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiPropertyOptional({ example: 10, description: 'Whole boxes' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  boxes?: number;

  @ApiPropertyOptional({ example: 2, description: 'Loose pieces' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  pieces?: number;

  @ApiPropertyOptional({ description: 'Derived from box/pieces when omitted' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @IsOptional()
  qtyBoxes?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  mrp?: number;

  @ApiProperty({ description: "Blank uses the branch's selling price" })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rate!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPct?: number;

  @ApiPropertyOptional({ description: "Defaults to the product's GST rate" })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(28)
  @IsOptional()
  gstRate?: number;
}

export class CreateSalesOrderDto {
  @ApiProperty({ format: 'uuid', description: 'Orders require a customer master record' })
  @IsUUID('4')
  customerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  customerAddress?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(20)
  @IsOptional()
  customerMobile?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Ignored when the caller is themselves a salesperson',
  })
  @IsUUID('4')
  @IsOptional()
  salesmanUserId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  orderDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  deliveryDate?: string;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  freightCharge?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  unloadingCharge?: number;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  loadingCharge?: number;

  @ApiPropertyOptional({ default: 0, description: 'May be negative' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  roundOff?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  remarks?: string;

  @ApiProperty({ type: [SalesOrderLineDto], maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineDto)
  lines!: SalesOrderLineDto[];
}

export class UpdateSalesOrderDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  customerAddress?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(20)
  @IsOptional()
  customerMobile?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  salesmanUserId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  orderDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  deliveryDate?: string;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  freightCharge?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  unloadingCharge?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  loadingCharge?: number;

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  roundOff?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  remarks?: string;

  @ApiPropertyOptional({ type: [SalesOrderLineDto], maxItems: 200 })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineDto)
  @IsOptional()
  lines?: SalesOrderLineDto[];

  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class ConvertQuotationDto {
  @ApiPropertyOptional({ format: 'date-time', description: 'Promised delivery date' })
  @IsDateString()
  @IsOptional()
  deliveryDate?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Required when the quotation was raised for a walk-in customer',
  })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;
}

export class VersionDto {
  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CancelSalesOrderDto extends VersionDto {
  @ApiProperty({ example: 'Customer postponed the site work' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class SalesOrderListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsIn(STATUSES)
  @IsOptional()
  status?: SalesOrderStatus;
}

export class ConfirmSalesOrderDto {
  @ApiProperty({ example: 1, description: 'Optimistic concurrency guard' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({
    description: 'Let other branches supply what this one cannot, on this confirmation',
  })
  @IsBoolean()
  @IsOptional()
  allowCrossBranch?: boolean;
}

export class AvailableStockQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiProperty({ description: 'Comma-separated product ids' })
  @IsString()
  productIds!: string;

  @ApiPropertyOptional({
    description: 'Look in every branch, not just this one — for a cross-branch order',
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  crossBranch?: boolean;
}
