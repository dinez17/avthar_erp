import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type { VisitOutcome, VisitPurpose, VisitStatus } from '@tiles-erp/shared-types';
import { PaginationQueryDto } from '../../../../core/http/dto/pagination-query.dto';

const PURPOSES: VisitPurpose[] = [
  'INTRODUCTION',
  'PRODUCT_DEMO',
  'QUOTATION_DISCUSSION',
  'NEGOTIATION',
  'SITE_MEASUREMENT',
  'PAYMENT_FOLLOWUP',
  'RELATIONSHIP',
  'OTHER',
];

const STATUSES: VisitStatus[] = ['PLANNED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

const OUTCOMES: VisitOutcome[] = [
  'INTERESTED',
  'NOT_INTERESTED',
  'FOLLOW_UP_NEEDED',
  'QUOTATION_REQUESTED',
  'ORDER_DISCUSSED',
];

export class CreateSalesVisitDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  leadId!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Salesperson making the visit' })
  @IsUUID('4')
  @IsOptional()
  salespersonUserId?: string;

  @ApiPropertyOptional({ enum: PURPOSES, default: 'INTRODUCTION' })
  @IsIn(PURPOSES)
  @IsOptional()
  purpose?: VisitPurpose;

  @ApiPropertyOptional({ enum: STATUSES, default: 'PLANNED' })
  @IsIn(STATUSES)
  @IsOptional()
  status?: VisitStatus;

  @ApiPropertyOptional({ enum: OUTCOMES, description: 'Required to complete a visit' })
  @IsIn(OUTCOMES)
  @IsOptional()
  outcome?: VisitOutcome;

  @ApiProperty({ format: 'date-time', description: 'When the visit is planned for' })
  @IsDateString()
  scheduledAt!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  completedAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  location?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ format: 'date-time', description: "Next action date; writes the lead's follow-up" })
  @IsDateString()
  @IsOptional()
  nextFollowUpAt?: string;
}

export class UpdateSalesVisitDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  salespersonUserId?: string;

  @ApiPropertyOptional({ enum: PURPOSES })
  @IsIn(PURPOSES)
  @IsOptional()
  purpose?: VisitPurpose;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsIn(STATUSES)
  @IsOptional()
  status?: VisitStatus;

  @ApiPropertyOptional({ enum: OUTCOMES })
  @IsIn(OUTCOMES)
  @IsOptional()
  outcome?: VisitOutcome;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  completedAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(300)
  @IsOptional()
  location?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsDateString()
  @IsOptional()
  nextFollowUpAt?: string;

  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class SalesVisitListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  leadId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  salespersonUserId?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsIn(STATUSES)
  @IsOptional()
  status?: VisitStatus;

  @ApiPropertyOptional({ description: 'Only planned visits now overdue' })
  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  overdue?: boolean;
}
