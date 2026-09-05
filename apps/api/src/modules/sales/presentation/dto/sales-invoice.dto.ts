import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
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
import type { SalesInvoiceStatus } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

const STATUSES: SalesInvoiceStatus[] = ['DRAFT', 'POSTED', 'CANCELLED'];

export class SalesInvoiceLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'The order line being drawn down' })
  @IsUUID('4')
  @IsOptional()
  salesOrderLineId?: string;

  @ApiProperty({ format: 'uuid', description: 'Godown the goods leave from' })
  @IsUUID('4')
  godownId!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(60)
  @IsOptional()
  batchNo?: string | null;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(60)
  @IsOptional()
  shade?: string | null;

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

  @ApiProperty({ description: "Blank uses the order's agreed rate" })
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

  @ApiPropertyOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(28)
  @IsOptional()
  gstRate?: number;
}

export class CreateSalesInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  customerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Omit for a direct counter sale' })
  @IsUUID('4')
  @IsOptional()
  salesOrderId?: string;

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

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  invoiceDate?: string;

  @ApiPropertyOptional({ format: 'date-time', description: "Defaults to the customer's credit days" })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

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

  @ApiProperty({ type: [SalesInvoiceLineDto], maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SalesInvoiceLineDto)
  lines!: SalesInvoiceLineDto[];
}

export class UpdateSalesInvoiceDto {
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

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  invoiceDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

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

  @ApiPropertyOptional({ type: [SalesInvoiceLineDto], maxItems: 200 })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SalesInvoiceLineDto)
  @IsOptional()
  lines?: SalesInvoiceLineDto[];

  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class InvoiceVersionDto {
  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CancelSalesInvoiceDto extends InvoiceVersionDto {
  @ApiProperty({ example: 'Goods returned before delivery' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class SalesInvoiceListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  salesOrderId?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsIn(STATUSES)
  @IsOptional()
  status?: SalesInvoiceStatus;
}

export class SplitInvoiceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  salesOrderId!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  invoiceDate?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Limit the split to these branches; omit for every supplying branch',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  @IsOptional()
  branchIds?: string[];
}
