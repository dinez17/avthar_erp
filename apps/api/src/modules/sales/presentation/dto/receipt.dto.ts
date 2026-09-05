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
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { ReceiptMode, ReceiptStatus } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

/** MIXED is derived from the payment lines, never sent by a client. */
const MODES: ReceiptMode[] = ['CASH', 'BANK', 'UPI', 'CHEQUE', 'CARD'];
const STATUSES: ReceiptStatus[] = ['DRAFT', 'POSTED', 'CANCELLED'];

export class ReceiptAllocationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  salesInvoiceId!: string;

  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;
}

export class ReceiptPaymentDto {
  @ApiProperty({ enum: MODES })
  @IsIn(MODES)
  mode!: ReceiptMode;

  @ApiProperty({ example: 1000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiPropertyOptional({ description: 'Cheque number, UPI reference or bank transaction id' })
  @IsString()
  @MaxLength(60)
  @IsOptional()
  referenceNo?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Which of your cash or bank accounts the money went into',
  })
  @IsUUID('4')
  @IsOptional()
  accountId?: string;

  @ApiPropertyOptional({ deprecated: true, description: 'Superseded by accountId' })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  bankName?: string;
}

export class CreateReceiptDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  customerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  receiptDate?: string;

  @ApiProperty({
    type: [ReceiptPaymentDto],
    description: 'One row per tender; the receipt total is their sum',
    maxItems: 10,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReceiptPaymentDto)
  payments!: ReceiptPaymentDto[];

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  remarks?: string;

  @ApiPropertyOptional({
    type: [ReceiptAllocationDto],
    description: 'Omit to settle the oldest open invoices automatically',
    maxItems: 100,
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocationDto)
  @IsOptional()
  allocations?: ReceiptAllocationDto[];
}

export class UpdateReceiptDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  receiptDate?: string;

  @ApiPropertyOptional({ type: [ReceiptPaymentDto], maxItems: 10 })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReceiptPaymentDto)
  @IsOptional()
  payments?: ReceiptPaymentDto[];

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  remarks?: string;

  @ApiPropertyOptional({ type: [ReceiptAllocationDto], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocationDto)
  @IsOptional()
  allocations?: ReceiptAllocationDto[];

  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class ReceiptVersionDto {
  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CancelReceiptDto extends ReceiptVersionDto {
  @ApiProperty({ example: 'Cheque returned unpaid' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class ReceiptListQueryDto extends PaginationQueryDto {
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
  status?: ReceiptStatus;
}

export class OpenInvoicesQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  customerId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;
}

export class LedgerQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  to?: string;
}

export class OutstandingQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;
}
