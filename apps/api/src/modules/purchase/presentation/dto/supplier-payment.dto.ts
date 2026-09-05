import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { ReceiptMode, ReceiptStatus } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

const MODES = ['CASH', 'BANK', 'UPI', 'CHEQUE', 'CARD', 'MIXED'] as const;
const STATUSES = ['DRAFT', 'POSTED', 'CANCELLED'] as const;

export class SupplierPaymentTenderDto {
  @ApiProperty({ enum: MODES })
  @IsIn(MODES)
  mode!: ReceiptMode;

  @ApiProperty({ example: 50000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ description: 'Cheque number, UPI reference or bank transaction id' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  referenceNo?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Which of your cash or bank accounts the money left',
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

export class SupplierPaymentAllocationDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  purchaseInvoiceId!: string;

  @ApiProperty({ example: 25000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;
}

export class SupplierPaymentDebitNoteDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  purchaseReturnId!: string;

  @ApiProperty({ example: 4200 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;
}

export class CreateSupplierPaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  supplierId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  paymentDate?: string;

  @ApiProperty({
    type: [SupplierPaymentTenderDto],
    maxItems: 10,
    description: 'May be empty when the payment is purely a debit-note set-off',
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => SupplierPaymentTenderDto)
  tenders!: SupplierPaymentTenderDto[];

  @ApiPropertyOptional({ type: [SupplierPaymentDebitNoteDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SupplierPaymentDebitNoteDto)
  @IsOptional()
  debitNotes?: SupplierPaymentDebitNoteDto[];

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  remarks?: string;

  @ApiPropertyOptional({
    type: [SupplierPaymentAllocationDto],
    maxItems: 100,
    description: 'Omit to settle the bills falling due soonest, automatically',
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SupplierPaymentAllocationDto)
  @IsOptional()
  allocations?: SupplierPaymentAllocationDto[];
}

export class UpdateSupplierPaymentDto extends CreateSupplierPaymentDto {
  @ApiProperty({ example: 1, description: 'Optimistic concurrency guard' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class VersionDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class CancelSupplierPaymentDto extends VersionDto {
  @ApiProperty({ example: 'Cheque bounced' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class SupplierPaymentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsIn(STATUSES)
  @IsOptional()
  status?: ReceiptStatus;
}

export class SupplierScopeQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  supplierId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;
}

export class SupplierLedgerQueryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  supplierId!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  to?: string;
}

export class PayablesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;
}
