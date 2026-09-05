import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PERMISSIONS } from '@tiles-erp/config';
import { financialYearOf, isValidPrefix, ValidationError } from '@tiles-erp/shared';
import type { DocumentType, NumberSeriesItem } from '@tiles-erp/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import {
  DocumentNumberService,
  FALLBACK_PREFIX,
} from '../../../core/numbering/document-number.service';
import { PrismaService } from '../../../core/prisma/prisma.service';

const DOCUMENT_TYPES = Object.keys(FALLBACK_PREFIX) as DocumentType[];
const SEPARATORS = ['/', '-'];

export class SaveNumberSeriesDto {
  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsIn(DOCUMENT_TYPES)
  documentType!: DocumentType;

  @ApiPropertyOptional({ format: 'uuid', description: 'Omit for a company-wide series' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiProperty({ example: 'AMB' })
  @IsString()
  prefix!: string;

  @ApiPropertyOptional({ enum: SEPARATORS, default: '/' })
  @IsIn(SEPARATORS)
  @IsOptional()
  separator?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 8, default: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  @IsOptional()
  padding?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  resetAnnually?: boolean;
}

export class BulkSeriesRowDto {
  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsIn(DOCUMENT_TYPES)
  documentType!: DocumentType;

  @ApiProperty({ example: 'AMB' })
  @IsString()
  prefix!: string;

  @ApiPropertyOptional({ enum: SEPARATORS })
  @IsIn(SEPARATORS)
  @IsOptional()
  separator?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 8 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  @IsOptional()
  padding?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  resetAnnually?: boolean;
}

export class SaveNumberSeriesBulkDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Omit for the company-wide series' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;

  @ApiProperty({ type: [BulkSeriesRowDto], maxItems: 32 })
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => BulkSeriesRowDto)
  series!: BulkSeriesRowDto[];
}

export class NumberSeriesQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsUUID('4')
  @IsOptional()
  branchId?: string;
}

/**
 * Branch-wise document numbering.
 *
 * The list is generated rather than stored: every document type is shown for the branch
 * asked about, whether or not it has been configured, with the built-in default filled
 * in. Configuring a series is then a single edit rather than a hunt for what is missing.
 */
@ApiTags('Settings')
@ApiBearerAuth()
@Controller('number-series')
export class NumberSeriesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Every document type for a branch, configured or not' })
  async list(@Query() query: NumberSeriesQueryDto): Promise<NumberSeriesItem[]> {
    const branchId = query.branchId ?? null;
    const financialYear = financialYearOf(new Date());

    const [rows, branch, sequences] = await Promise.all([
      this.prisma.numberSeriesSetting.findMany({
        where: { branchId },
      }),
      branchId
        ? this.prisma.branch.findFirst({ where: { id: branchId }, select: { name: true } })
        : Promise.resolve(null),
      this.prisma.numberSequence.findMany({
        where: { scope: branchId ?? '', financialYear },
      }),
    ]);

    const byType = new Map(rows.map((row) => [row.documentType, row]));
    const issuedByType = new Map(sequences.map((row) => [row.documentType, row.lastNumber]));

    return Promise.all(
      DOCUMENT_TYPES.map(async (documentType) => {
        const row = byType.get(documentType);
        return {
          id: row?.id ?? null,
          documentType,
          branchId,
          branchName: branch?.name ?? null,
          prefix: row?.prefix ?? FALLBACK_PREFIX[documentType],
          defaultPrefix: FALLBACK_PREFIX[documentType],
          separator: row?.separator ?? '/',
          padding: row?.padding ?? 4,
          resetAnnually: row?.resetAnnually ?? true,
          isDefault: !row,
          nextNumber: await this.numbering.peek(documentType, branchId),
          issuedThisYear: issuedByType.get(documentType) ?? 0,
          version: row?.version ?? 0,
        };
      }),
    );
  }

  @Post('bulk')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Set several document series for a branch in one go' })
  async saveBulk(
    @Body() dto: SaveNumberSeriesBulkDto,
    @CurrentUser('id') actorId: string,
  ): Promise<NumberSeriesItem[]> {
    const branchId = dto.branchId ?? null;

    // Validate the whole batch before writing any of it. Half-applied numbering is
    // worse than none: some documents would move to the new prefix and some would not,
    // and telling which afterwards means reading the counter table.
    for (const row of dto.series) {
      await this.assertUsable(row.documentType, branchId, row.prefix);
    }

    // Two rows in the same batch claiming one prefix would pass the checks above
    // individually and collide with each other.
    const seen = new Map<string, string>();
    for (const row of dto.series) {
      const key = `${row.documentType}|${row.prefix.trim().toUpperCase()}`;
      if (seen.has(key)) {
        throw new ValidationError(
          `${row.prefix} is used twice in this batch for the same document.`,
        );
      }
      seen.set(key, row.documentType);
    }

    for (const row of dto.series) {
      await this.write(row.documentType, branchId, row, actorId);
    }
    return this.list({ branchId: branchId ?? undefined });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Set how a branch numbers one kind of document' })
  async save(
    @Body() dto: SaveNumberSeriesDto,
    @CurrentUser('id') actorId: string,
  ): Promise<NumberSeriesItem[]> {
    if (!isValidPrefix(dto.prefix)) {
      throw new ValidationError(
        'A prefix must be 1–12 characters, start with a letter or digit, and contain no slashes.',
      );
    }

    const branchId = dto.branchId ?? null;
    await this.assertUsable(dto.documentType, branchId, dto.prefix);
    await this.write(dto.documentType, branchId, dto, actorId);
    return this.list({ branchId: branchId ?? undefined });
  }

  /**
   * Whether a prefix may be used for this document at this branch.
   *
   * Two branches sharing one would interleave into a single series on paper while
   * counting separately underneath — the same number printed twice.
   */
  private async assertUsable(
    documentType: DocumentType,
    branchId: string | null,
    prefix: string,
  ): Promise<void> {
    if (!isValidPrefix(prefix)) {
      throw new ValidationError(
        `"${prefix}" is not a usable prefix: 1–12 characters, starting with a letter or digit, and no slashes.`,
      );
    }

    const clash = await this.prisma.numberSeriesSetting.findFirst({
      where: {
        documentType,
        prefix: { equals: prefix, mode: 'insensitive' },
        NOT: { branchId },
      },
      select: { branch: { select: { name: true } } },
    });
    if (clash) {
      throw new ValidationError(
        `${prefix} is already used for this document by ${clash.branch?.name ?? 'the company-wide series'}. Give each branch its own prefix.`,
      );
    }
  }

  private async write(
    documentType: DocumentType,
    branchId: string | null,
    row: { prefix: string; separator?: string; padding?: number; resetAnnually?: boolean },
    actorId: string,
  ): Promise<void> {
    const data = {
      prefix: row.prefix.trim(),
      separator: row.separator ?? '/',
      padding: row.padding ?? 4,
      resetAnnually: row.resetAnnually ?? true,
    };

    const existing = await this.prisma.numberSeriesSetting.findFirst({
      where: { documentType, branchId },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.numberSeriesSetting.update({
        where: { id: existing.id },
        data: { ...data, updatedBy: actorId, version: { increment: 1 } },
      });
    } else {
      await this.prisma.numberSeriesSetting.create({
        data: { documentType, branchId, ...data, createdBy: actorId },
      });
    }
  }
}
