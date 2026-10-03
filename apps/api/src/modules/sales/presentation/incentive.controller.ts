import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';
import { PERMISSIONS } from '@tiles-erp/config';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';

class CreateIncentiveDto {
  @IsUUID('4') productId!: string;
  @Type(() => Number) @IsNumber() @Min(0) amountPerBox!: number;
}

const FIXED_FROM = new Date('2000-01-01T00:00:00.000Z');
const FIXED_TO = new Date('2999-12-31T23:59:59.999Z');

class BulkCreateIncentiveDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateIncentiveDto)
  items!: CreateIncentiveDto[];
}

class IncentiveReportQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsUUID('4') @IsOptional() branchId?: string;
  @IsUUID('4') @IsOptional() salesmanUserId?: string;
  @IsUUID('4') @IsOptional() productId?: string;
}

@ApiTags('Sales incentives')
@ApiBearerAuth()
@Controller('sales-incentives')
export class IncentiveController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INCENTIVE_READ)
  async list() {
    const rows = await this.prisma.productIncentive.findMany({
      include: { product: { select: { sku: true, name: true } } },
      orderBy: [{ validFrom: 'desc' }, { product: { name: 'asc' } }],
      distinct: ['productId'],
    });
    return rows.map((row) => ({ ...row, amountPerBox: Number(row.amountPerBox) }));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INCENTIVE_MANAGE)
  async create(@Body() input: CreateIncentiveDto) {
    await this.prisma.productIncentive.deleteMany({ where: { productId: input.productId } });
    if (input.amountPerBox === 0) return { productId: input.productId, amountPerBox: 0 };
    const row = await this.prisma.productIncentive.create({ data: { productId: input.productId, validFrom: FIXED_FROM, validTo: FIXED_TO, amountPerBox: input.amountPerBox }, include: { product: { select: { sku: true, name: true } } } });
    return { ...row, amountPerBox: Number(row.amountPerBox) };
  }

  @Post('bulk')
  @RequirePermissions(PERMISSIONS.INCENTIVE_MANAGE)
  async createBulk(@Body() input: BulkCreateIncentiveDto) {
    const productIds = input.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) throw new BadRequestException('Each product may appear only once');
    await this.prisma.$transaction(async (tx) => {
      await tx.productIncentive.deleteMany({ where: { productId: { in: productIds } } });
      await tx.productIncentive.createMany({ data: input.items.filter((item) => item.amountPerBox > 0).map((item) => ({ productId: item.productId, validFrom: FIXED_FROM, validTo: FIXED_TO, amountPerBox: item.amountPerBox })) });
    });
    return { created: input.items.length };
  }

  @Get('report')
  @RequirePermissions(PERMISSIONS.INCENTIVE_READ)
  async report(@Query() query: IncentiveReportQueryDto) {
    const from = new Date(query.from); from.setHours(0, 0, 0, 0);
    const to = new Date(query.to); to.setHours(23, 59, 59, 999);
    const lines = await this.prisma.salesInvoiceLine.findMany({
      where: {
        ...(query.productId ? { productId: query.productId } : {}),
        salesInvoice: {
          deletedAt: null, status: 'POSTED', invoiceDate: { gte: from, lte: to },
          ...(query.branchId ? { branchId: query.branchId } : {}),
          ...(query.salesmanUserId ? { salesmanUserId: query.salesmanUserId } : {}),
        },
      },
      select: {
        productId: true, qtyBoxes: true,
        product: { select: { sku: true, name: true } },
        salesInvoice: { select: { invoiceDate: true, salesmanUserId: true, salesmanName: true } },
      },
    });
    const incentives = await this.prisma.productIncentive.findMany({ where: { ...(query.productId ? { productId: query.productId } : {}) }, orderBy: { validFrom: 'desc' }, distinct: ['productId'] });
    const buckets = new Map<string, { salesmanUserId: string | null; salesmanName: string; productId: string; sku: string; productName: string; boxes: number; incentiveAmount: number }>();
    for (const line of lines) {
      const rule = incentives.find((item) => item.productId === line.productId);
      if (!rule) continue;
      const key = `${line.salesInvoice.salesmanUserId ?? 'none'}:${line.productId}`;
      const row = buckets.get(key) ?? { salesmanUserId: line.salesInvoice.salesmanUserId, salesmanName: line.salesInvoice.salesmanName ?? 'No salesman recorded', productId: line.productId, sku: line.product.sku, productName: line.product.name, boxes: 0, incentiveAmount: 0 };
      const boxes = Number(line.qtyBoxes);
      row.boxes += boxes;
      row.incentiveAmount += boxes * Number(rule.amountPerBox);
      buckets.set(key, row);
    }
    return [...buckets.values()].map((row) => ({ ...row, boxes: Math.round(row.boxes * 1000) / 1000, incentiveAmount: Math.round(row.incentiveAmount * 100) / 100 })).sort((a, b) => a.salesmanName.localeCompare(b.salesmanName) || a.productName.localeCompare(b.productName));
  }
}
