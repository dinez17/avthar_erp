import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { REGEX } from '@tiles-erp/config';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

export class CreateOrgNodeDto {
  @ApiProperty({ example: 'Head Office' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'HQ-001', description: 'Required for every level below Company' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ description: 'Company level only' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  legalName?: string;

  @ApiPropertyOptional({ example: '27AAPFU0939F1ZV' })
  @Matches(REGEX.GSTIN, { message: 'gstin must be a valid GSTIN' })
  @IsOptional()
  gstin?: string;


  @ApiPropertyOptional({ example: '12 Industrial Estate' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'Chennai' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'Tamil Nadu' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  state?: string;


  @ApiPropertyOptional({ example: '33', description: 'Official 2-digit GST state code' })
  @Matches(/^\d{2}$/, { message: 'stateCode must be a 2-digit GST state code' })
  @IsOptional()
  stateCode?: string;

  @ApiPropertyOptional({ example: '600001' })
  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit PIN code' })
  @IsOptional()
  pincode?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @Matches(/^[+]?\d{7,15}$/, { message: 'phone must be 7-15 digits, optionally prefixed with +' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'office@tileserp.local' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Required for every level below Company' })
  @IsUUID('4')
  @IsOptional()
  parentId?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateOrgNodeDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  legalName?: string;

  @ApiPropertyOptional()
  @Matches(REGEX.GSTIN, { message: 'gstin must be a valid GSTIN' })
  @IsOptional()
  gstin?: string;


  @ApiPropertyOptional({ example: '12 Industrial Estate' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  addressLine1?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(200)
  @IsOptional()
  addressLine2?: string;

  @ApiPropertyOptional({ example: 'Chennai' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'Tamil Nadu' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  state?: string;


  @ApiPropertyOptional({ example: '33', description: 'Official 2-digit GST state code' })
  @Matches(/^\d{2}$/, { message: 'stateCode must be a 2-digit GST state code' })
  @IsOptional()
  stateCode?: string;

  @ApiPropertyOptional({ example: '600001' })
  @Matches(/^\d{6}$/, { message: 'pincode must be a 6-digit PIN code' })
  @IsOptional()
  pincode?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @Matches(/^[+]?\d{7,15}$/, { message: 'phone must be 7-15 digits, optionally prefixed with +' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'office@tileserp.local' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class OrgNodeListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by parent node' })
  @IsUUID('4')
  @IsOptional()
  parentId?: string;
}

export class BulkOrgNodeEntryDto {
  @ApiProperty({ example: 'Gate 1' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'GATE-01' })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code!: string;
}

export class BulkCreateOrgNodesDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  parentId!: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ type: [BulkOrgNodeEntryDto], maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BulkOrgNodeEntryDto)
  items!: BulkOrgNodeEntryDto[];
}
