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
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { GatePassStatus, GatePassType } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

const TYPES: GatePassType[] = ['SALES', 'TRANSFER', 'SAMPLE'];
const STATUSES: GatePassStatus[] = ['DRAFT', 'LOADED', 'GATED_OUT', 'DELIVERED', 'CANCELLED'];

export class GatePassDocumentDto {
  @ApiProperty({
    description: "Ties this pass's lines to the document before either has an id",
    example: 'inv-1',
  })
  @IsString()
  @MaxLength(64)
  key!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  salesInvoiceId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  stockTransferId?: string;

  @ApiPropertyOptional({ description: "This drop's address, if not the customer's own" })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  deliveryAddress?: string;

  @ApiPropertyOptional({ description: 'The order of the drops on a multi-customer round' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  sequence?: number;

  @ApiPropertyOptional({
    description:
      "What this customer is charged for the drop. Defaults to the invoice's own freight, " +
      'which leaves nothing to collect at the door.',
    example: 1500,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  freightCharge?: number;
}

export class GatePassLineDto {
  @ApiPropertyOptional({ description: 'The document key this line belongs to' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  documentKey?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  godownId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  gateId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(60)
  @IsOptional()
  batchNo?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(60)
  @IsOptional()
  shade?: string;

  @ApiPropertyOptional({ description: 'What the document says should go', example: 20 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @IsOptional()
  docQtyBoxes?: number;

  @ApiPropertyOptional({ description: 'Whole boxes loaded', example: 18 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  boxes?: number;

  @ApiPropertyOptional({ description: 'Loose pieces loaded', example: 3 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  pieces?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  remarks?: string;
}

export class CreateGatePassDto {
  @ApiProperty({ enum: TYPES })
  @IsIn(TYPES)
  type!: GatePassType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  gateId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  passDate?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required for SAMPLE. For SALES it is derived from the invoices aboard, since one ' +
      'pass may drop at several customers.',
  })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required for TRANSFER' })
  @IsUUID('4')
  @IsOptional()
  toBranchId?: string;

  @ApiPropertyOptional({ description: 'Site or address, which is often not the billing address' })
  @IsString()
  @MaxLength(300)
  @IsOptional()
  destination?: string;

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

  @ApiPropertyOptional({
    description: 'Only for a hired lorry not in the master; a chosen vehicle wins over it',
  })
  @IsString()
  @MaxLength(20)
  @IsOptional()
  vehicleNumber?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(120)
  @IsOptional()
  driverName?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(20)
  @IsOptional()
  driverPhone?: string;

  @ApiPropertyOptional({ description: 'What the trip costs us', example: 2500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  hireCharge?: number;

  @ApiPropertyOptional({ description: 'Paid to the driver on departure', example: 1000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  advancePaid?: number;

  @ApiPropertyOptional({ description: 'Samples default to returnable' })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  returnable?: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  expectedReturnDate?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  remarks?: string;

  @ApiPropertyOptional({ type: [GatePassDocumentDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GatePassDocumentDto)
  @IsOptional()
  documents?: GatePassDocumentDto[];

  @ApiProperty({ type: [GatePassLineDto], minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GatePassLineDto)
  lines!: GatePassLineDto[];
}

export class UpdateGatePassDto extends CreateGatePassDto {
  @ApiProperty({ description: 'The version last read, for optimistic concurrency' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ enum: TYPES })
  @IsIn(TYPES)
  @IsOptional()
  declare type: GatePassType;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  declare branchId: string;

  @ApiPropertyOptional({ type: [GatePassLineDto], maxItems: 500 })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GatePassLineDto)
  @IsOptional()
  declare lines: GatePassLineDto[];
}

export class GatePassVersionDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class SetLoadedDto extends GatePassVersionDto {
  @ApiPropertyOptional({
    description: 'False sends a checked load back to draft for correction',
    default: true,
  })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  loaded?: boolean;
}

export class GateOutDto extends GatePassVersionDto {
  @ApiPropertyOptional({ description: 'The odometer as the vehicle leaves', example: 84210 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  startKm?: number;
}

export class DropSettlementDto {
  @ApiProperty({ format: 'uuid', description: 'The drop being settled' })
  @IsUUID('4')
  documentId!: string;

  @ApiPropertyOptional({ description: 'Settled at the counter rather than at the door' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  freightPaidAtBranch?: number;

  @ApiPropertyOptional({ description: 'Taken by the driver at the door' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  freightCollected?: number;
}

export class CloseTripDto extends GatePassVersionDto {
  @ApiPropertyOptional({ description: 'The odometer as the vehicle comes back', example: 84346 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  endKm?: number;

  @ApiPropertyOptional({ description: 'Cash counted off the driver at the desk' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  cashHandedOver?: number;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  closeRemarks?: string;

  @ApiPropertyOptional({ type: [DropSettlementDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => DropSettlementDto)
  @IsOptional()
  settlements?: DropSettlementDto[];
}

export class DeliverGatePassDto extends GatePassVersionDto {
  @ApiProperty({ description: 'Who took delivery — the pass is the proof' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  receivedByName!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(20)
  @IsOptional()
  receivedByPhone?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  deliveredAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  podRemarks?: string;
}

export class CancelGatePassDto extends GatePassVersionDto {
  @ApiProperty({ example: 'Vehicle broke down before leaving' })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class GatePassListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ enum: TYPES })
  @IsIn(TYPES)
  @IsOptional()
  type?: GatePassType;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsIn(STATUSES)
  @IsOptional()
  status?: GatePassStatus;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  to?: string;
}

export class PendingDispatchQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;
}
