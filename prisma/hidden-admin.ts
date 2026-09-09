/* eslint-disable no-console */
/**
 * Provisions a hidden super-admin account.
 *
 * Run deliberately, never as part of a deploy:
 *
 *   docker compose --env-file .env.production -f docker/docker-compose.prod.yml \
 *     run --rm -e HIDDEN_ADMIN_EMAIL=you@example.com -e HIDDEN_ADMIN_PASSWORD='…' \
 *     migrate sh -c 'cd /repo/apps/api && pnpm exec ts-node --transpile-only /repo/prisma/hidden-admin.ts'
 *
 * The credentials come from the environment rather than this file. A personal email
 * and password committed to a repository is a credential leak the moment anyone else
 * clones it, and this script has to stay useful for whoever maintains the system next.
 *
 * Unlike the seed, this DOES reset the password of an existing account — that is the
 * point of running it. The seed upserts with `update: {}` precisely so a redeploy never
 * touches a live password; this is the deliberate override.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { SYSTEM_ROLES } from '@tiles-erp/config';

const prisma = new PrismaClient();

const EMAIL = process.env.HIDDEN_ADMIN_EMAIL?.trim();
const PASSWORD = process.env.HIDDEN_ADMIN_PASSWORD;
const FIRST_NAME = process.env.HIDDEN_ADMIN_FIRST_NAME?.trim() || 'System';
const LAST_NAME = process.env.HIDDEN_ADMIN_LAST_NAME?.trim() || 'Maintenance';

async function main(): Promise<void> {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      'Set HIDDEN_ADMIN_EMAIL and HIDDEN_ADMIN_PASSWORD. Nothing was changed.',
    );
  }
  if (PASSWORD.length < 12) {
    // A hidden account is not in the user list, so nobody will notice it being
    // brute-forced. It gets a longer minimum than the UI enforces.
    throw new Error('HIDDEN_ADMIN_PASSWORD must be at least 12 characters. Nothing was changed.');
  }

  const superAdminRole = await prisma.role.findUniqueOrThrow({
    where: { name: SYSTEM_ROLES.SUPER_ADMIN },
  });
  const department = await prisma.department.findUniqueOrThrow({
    where: { name: 'Administration' },
  });
  // Whichever branch exists first — a maintenance account needs a branch scope to pass
  // the branch guard, and which one it is has no business meaning.
  const branch = await prisma.branch.findFirstOrThrow({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });

  const passwordHash = await hash(PASSWORD, 12);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, isHidden: true, isActive: true },
    create: {
      email: EMAIL,
      passwordHash,
      firstName: FIRST_NAME,
      lastName: LAST_NAME,
      isActive: true,
      isHidden: true,
    },
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: superAdminRole.id } },
    update: {},
    create: { userId: user.id, roleId: superAdminRole.id },
  });
  await prisma.userBranch.upsert({
    where: { userId_branchId: { userId: user.id, branchId: branch.id } },
    update: {},
    create: { userId: user.id, branchId: branch.id },
  });
  await prisma.userDepartment.upsert({
    where: { userId_departmentId: { userId: user.id, departmentId: department.id } },
    update: {},
    create: { userId: user.id, departmentId: department.id },
  });

  // The password is never echoed: this runs on a server whose shell history and
  // container logs outlive the session.
  console.log(`Hidden super admin ready: ${EMAIL}`);
  console.log(`  branch      ${branch.name}`);
  console.log(`  hidden      yes — absent from the user list and salesman pickers`);
  console.log(`  audited     yes — actions are attributed normally`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
