import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

export class GoodsReceiptLineDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Order line being received against' })
  @IsUUID('4')
  @IsOptional()
  orderLineId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiPropertyOptional({ example: 'B-2401' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  batchNo?: string;

  @ApiPropertyOptional({ example: 'Light' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  shade?: string;

  @ApiProperty({ example: 50, description: 'Boxes received' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  qtyBoxes!: number;

  @ApiPropertyOptional({ example: 850, description: 'Defaults to the order line rate' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  rate?: number;
}

export class CreateGoodsReceiptDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Approved order being received' })
  @IsUUID('4')
  @IsOptional()
  orderId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  supplierId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  branchId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  godownId!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  receiptDate?: string;

  @ApiPropertyOptional({ example: 'INV-8842' })
  @IsString()
  @MaxLength(64)
  @IsOptional()
  supplierInvoiceNo?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  remarks?: string;

  @ApiProperty({ type: [GoodsReceiptLineDto], maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines!: GoodsReceiptLineDto[];
}

export class GoodsReceiptListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  supplierId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  orderId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  fromDate?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  toDate?: string;

  @ApiPropertyOptional({
    description: 'Only receipts not yet billed — what the invoice picker offers',
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  uninvoiced?: boolean;
}
