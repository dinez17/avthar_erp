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
  ValidateNested,
} from 'class-validator';
import type { TransferStatus } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

export class TransferLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(64)
  @IsOptional()
  batchNo?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(64)
  @IsOptional()
  shade?: string;

  @ApiProperty({ example: 10, description: 'Whole boxes to move' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  boxes!: number;

  @ApiProperty({ example: 2, description: 'Loose pieces to move' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  pieces!: number;

  @ApiPropertyOptional({
    example: 450,
    description: "Per-box value for the document; the product's landing cost if omitted",
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  rate?: number;
}

export class CreateTransferDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  fromBranchId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  fromGodownId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  toBranchId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  toGodownId!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  transferDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  remarks?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  transporterId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  vehicleId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  driverId?: string;

  @ApiPropertyOptional({ description: "The transporter's consignment note number" })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  lrNumber?: string;

  @ApiPropertyOptional({ example: 2500, description: 'What the lorry costs you' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  freightCharge?: number;

  @ApiPropertyOptional({ example: 180, description: 'Road distance, for the e-way bill' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  @IsOptional()
  distanceKm?: number;

  @ApiPropertyOptional({ example: '351234567890' })
  @IsString()
  @MaxLength(32)
  @IsOptional()
  ewayBillNo?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  ewayBillDate?: string;

  @ApiProperty({ type: [TransferLineDto], maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines!: TransferLineDto[];
}

export class ReceiveTransferLineDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(64)
  @IsOptional()
  batchNo?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(64)
  @IsOptional()
  shade?: string;

  @ApiProperty({ example: 98, description: 'Boxes counted in at the destination' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  qtyReceived!: number;
}

export class ReceiveTransferDto {
  @ApiProperty({ example: 'S. Kumar', description: 'Who signed for the goods' })
  @IsString()
  @MaxLength(120)
  receivedByName!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  receivedAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  receiptRemarks?: string;

  @ApiPropertyOptional({
    type: [ReceiveTransferLineDto],
    maxItems: 200,
    description: 'Only lines that arrived short; anything omitted is taken as received in full',
  })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReceiveTransferLineDto)
  @IsOptional()
  lines?: ReceiveTransferLineDto[];
}

export class CancelTransferDto {
  @ApiProperty({ example: 'Lorry broke down, load returned to the godown' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class TransferListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Transfers into or out of this branch' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ enum: ['IN_TRANSIT', 'RECEIVED', 'CANCELLED'] })
  @IsIn(['IN_TRANSIT', 'RECEIVED', 'CANCELLED'])
  @IsOptional()
  status?: TransferStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  toDate?: string;
}
