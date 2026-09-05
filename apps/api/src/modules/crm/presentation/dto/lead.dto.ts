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
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { LeadSource, LeadStage } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';
import { QuotationLineDto } from '../../../sales/presentation/dto/quotation.dto';

const SOURCES: LeadSource[] = [
  'WALK_IN',
  'PHONE',
  'REFERRAL',
  'WEBSITE',
  'EXHIBITION',
  'SOCIAL_MEDIA',
  'ADVERTISEMENT',
  'OTHER',
];

const STAGES: LeadStage[] = ['NEW', 'FOLLOW_UP', 'CONVERTED', 'NOT_INTERESTED'];

/** Stages a lead may be created in — CONVERTED and NOT_INTERESTED are reached later. */
const INITIAL_STAGES: LeadStage[] = ['NEW', 'FOLLOW_UP'];

/** Stages the hand-move endpoint accepts; CONVERTED is only ever reached by conversion. */
const HAND_STAGES: Exclude<LeadStage, 'CONVERTED'>[] = ['NEW', 'FOLLOW_UP', 'NOT_INTERESTED'];

export class CreateLeadDto {
  @ApiPropertyOptional({ description: 'Left blank, a sequential code is generated' })
  @IsString()
  @MaxLength(32)
  @IsOptional()
  code?: string;

  @ApiProperty({ example: 'Ramesh Kumar' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'Sri Balaji Traders' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  companyName?: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @Matches(/^[+]?\d{7,15}$/, { message: 'phone must be 7-15 digits, optionally prefixed with +' })
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '9876500000' })
  @Matches(/^[+]?\d{7,15}$/, { message: 'altPhone must be 7-15 digits' })
  @IsOptional()
  altPhone?: string;

  @ApiPropertyOptional({ format: 'email' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'Chennai' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ enum: SOURCES, default: 'WALK_IN' })
  @IsIn(SOURCES)
  @IsOptional()
  source?: LeadSource;

  @ApiPropertyOptional({ enum: INITIAL_STAGES, default: 'NEW' })
  @IsIn(INITIAL_STAGES)
  @IsOptional()
  stage?: LeadStage;

  @ApiPropertyOptional({ format: 'uuid', description: 'Salesperson or telecaller who owns it' })
  @IsUUID('4')
  @IsOptional()
  ownerUserId?: string;

  @ApiPropertyOptional({ minimum: 0, default: 0, description: 'Estimated deal value' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  expectedValue?: number;

  @ApiPropertyOptional({ format: 'date-time', description: 'When to next chase the lead' })
  @IsDateString()
  @IsOptional()
  nextFollowUpAt?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Existing customer master, if any' })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Branch working the lead' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Marketing campaign to attribute to' })
  @IsUUID('4')
  @IsOptional()
  campaignId?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}

/**
 * Edits the lead's own fields. Stage is deliberately not editable here — it inherits the
 * create form's initial stages only — so the converted/not-interested transitions can flow
 * solely through the stage and convert endpoints, where their rules (a reason for a drop, a
 * quotation for CONVERTED) are enforced.
 */
export class UpdateLeadDto extends CreateLeadDto {
  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class ChangeLeadStageDto {
  @ApiProperty({ enum: HAND_STAGES })
  @IsIn(HAND_STAGES)
  stage!: Exclude<LeadStage, 'CONVERTED'>;

  @ApiPropertyOptional({ description: 'Required when marking the lead not interested' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  lostReason?: string;

  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class ConvertLeadDto {
  @ApiPropertyOptional({ format: 'uuid', description: "Defaults to the lead's branch" })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: "Defaults to the lead's linked customer" })
  @IsUUID('4')
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(500)
  @IsOptional()
  remarks?: string;

  @ApiProperty({ type: [QuotationLineDto], maxItems: 200 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuotationLineDto)
  lines!: QuotationLineDto[];
}

export class LeadListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: STAGES })
  @IsIn(STAGES)
  @IsOptional()
  stage?: LeadStage;

  @ApiPropertyOptional({ enum: SOURCES })
  @IsIn(SOURCES)
  @IsOptional()
  source?: LeadSource;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  ownerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  campaignId?: string;

  @ApiPropertyOptional({ description: 'Only open leads with a follow-up now due' })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  followUpDue?: boolean;
}
