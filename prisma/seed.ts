/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import {
  ALL_PERMISSIONS,
  SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
  type SystemRole,
} from '@tiles-erp/config';

const prisma = new PrismaClient();

const SEED_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@tileserp.local';
const SEED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123';

async function seedPermissions(): Promise<void> {
  for (const code of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, description: code },
    });
  }
  console.log(`Seeded ${ALL_PERMISSIONS.length} permissions`);
}

async function seedRoles(): Promise<void> {
  for (const roleName of Object.values(SYSTEM_ROLES)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `${roleName} system role`, isSystem: true },
    });

    const permissionCodes = SYSTEM_ROLE_PERMISSIONS[roleName as SystemRole];
    const permissions = await prisma.permission.findMany({
      where: { code: { in: permissionCodes } },
    });

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  console.log(`Seeded ${Object.keys(SYSTEM_ROLES).length} system roles`);
}

async function seedCompany(): Promise<string> {
  const company = await prisma.company.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Tiles ERP HQ',
      legalName: 'Tiles ERP Private Limited',
    },
  });

  const branch = await prisma.branch.upsert({
    where: { code: 'HQ-001' },
    update: {},
    create: { companyId: company.id, name: 'Head Office', code: 'HQ-001' },
  });

  await prisma.department.upsert({
    where: { name: 'Administration' },
    update: {},
    create: { name: 'Administration', description: 'System administration' },
  });

  return branch.id;
}

async function seedSuperAdmin(branchId: string): Promise<void> {
  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: SYSTEM_ROLES.SUPER_ADMIN },
  });
  const department = await prisma.department.findUniqueOrThrow({
    where: { name: 'Administration' },
  });

  const passwordHash = await hash(SEED_ADMIN_PASSWORD, 12);
  const user = await prisma.user.upsert({
    where: { email: SEED_ADMIN_EMAIL },
    update: {},
    create: {
      email: SEED_ADMIN_EMAIL,
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      isActive: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: user.id, roleId: superAdminRole.id },
  });
  await prisma.userBranch.upsert({
    where: { userId_branchId: { userId: user.id, branchId } },
    update: {},
    create: { userId: user.id, branchId },
  });
  await prisma.userDepartment.upsert({
    where: { userId_departmentId: { userId: user.id, departmentId: department.id } },
    update: {},
    create: { userId: user.id, departmentId: department.id },
  });

  console.log(`Seeded super admin: ${SEED_ADMIN_EMAIL} (password: ${SEED_ADMIN_PASSWORD})`);
}

const DEFAULT_SETTINGS: { key: string; value: string; description: string }[] = [
  { key: 'app.name', value: 'Tiles ERP', description: 'Display name used across the UI' },
  { key: 'app.currency', value: 'INR', description: 'Default currency code' },
  { key: 'app.dateFormat', value: 'DD/MM/YYYY', description: 'Default date display format' },
  { key: 'app.timezone', value: 'Asia/Kolkata', description: 'Default timezone' },
  {
    key: 'credit.approvalLevels',
    value: '[{"level":1,"maxExcess":50000},{"level":2,"maxExcess":200000},{"level":3,"maxExcess":0}]',
    description:
      'How far past a credit limit each approval rung may release. maxExcess 0 means no ceiling. A malformed value falls back to this ladder rather than blocking sales.',
  },
  {
    key: 'sales.marginFloorPct',
    value: '10',
    description:
      'Margin percent below which a line is flagged while quoting. A warning, not a block — thin is sometimes the right call. Set to 0 to turn it off.',
  },
  {
    key: 'quotation.terms',
    value: [
      'Rates are subject to change without notice after the validity date.',
      'Goods once sold will not be taken back or exchanged.',
      'Delivery within the agreed period, subject to stock availability.',
      'Breakage or shortage must be reported at the time of delivery.',
      'Payment as per the agreed credit terms.',
    ].join('\n'),
    description: 'Terms printed at the foot of a quotation, one per line',
  },
  {
    key: 'invoice.terms',
    value: [
      'Goods once sold will not be taken back or exchanged.',
      'Breakage or shortage must be reported at the time of delivery.',
      'Interest at 24% per annum is charged on bills not paid within the credit period.',
      'Subject to jurisdiction of the courts where the branch is situated.',
    ].join('\n'),
    description: 'Terms printed at the foot of a tax invoice, one per line',
  },
  {
    key: 'invoice.declaration',
    value:
      'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
    description: 'Declaration printed above the signature on a tax invoice',
  },
  {
    key: 'billing.financialYearStartMonth',
    value: '4',
    description: 'Month (1-12) the financial year starts in',
  },
];

async function seedSettings(): Promise<void> {
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
  console.log(`Seeded ${DEFAULT_SETTINGS.length} settings`);
}

async function main(): Promise<void> {
  console.log('Seeding Tiles ERP foundation data...');
  await seedPermissions();
  await seedRoles();
  const branchId = await seedCompany();
  await seedSuperAdmin(branchId);
  await seedSettings();
  console.log('Seed complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
