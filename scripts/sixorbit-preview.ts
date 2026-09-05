/**
 * Prints the exact request a product push would make, without sending it.
 *
 * `pnpm sixorbit:preview <sku-or-product-id>`
 *
 * Their write failures name a field and never quote the value — "Please Provide valid item
 * name" says nothing about what the item name was — so the only way to settle an argument
 * about the payload is to look at the payload. This reads the real product, builds the real
 * plan through the same `buildSixOrbitPushPlan` the push uses, and prints it beside the URL.
 *
 * It makes no network call and writes nothing. Credentials are read only to show which
 * base URL and user the call would go to; the access token is masked.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import {
  buildSixOrbitPushPlan,
  buildSixOrbitUrl,
  SIXORBIT_PUSH_BLOCK_REASONS,
  SIXORBIT_TASKS,
  SIXORBIT_URLQ,
  type SixOrbitPushInput,
} from '@tiles-erp/sixorbit';

/**
 * Reads `apps/api/.env` into the environment, without taking a dotenv dependency.
 *
 * The API server loads its own env through Nest's config module, which this script does
 * not boot. Parsing the file here rather than adding a package keeps a diagnostic tool
 * from changing what the application depends on. Anything already set in the real
 * environment wins, so a shell that exports `DATABASE_URL` is respected.
 */
function loadApiEnv(): void {
  try {
    const file = readFileSync(resolve(__dirname, '../apps/api/.env'), 'utf8');
    for (const line of file.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
      if (!match || line.trimStart().startsWith('#')) continue;
      const [, key, rawValue] = match;
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = rawValue?.replace(/^["']|["']$/g, '') ?? '';
    }
  } catch {
    // No file, or unreadable. The error from Prisma about a missing DATABASE_URL says
    // more than anything this could add.
  }
}

loadApiEnv();

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const key = process.argv[2];
  if (!key) {
    console.error('Usage: pnpm sixorbit:preview <sku-or-product-id>');
    process.exit(1);
  }

  // A sku is what a person has to hand; the id is what the queue logs. Accept either.
  //
  // The id clause is only included when the argument actually looks like a uuid. Postgres
  // will not compare a uuid column against arbitrary text, so an `OR` that always carries
  // `{ id: key }` fails outright on a sku — P2023, "invalid length: expected 32, found 5"
  // — and takes the sku lookup down with it.
  const looksLikeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);

  const product = await prisma.product.findFirst({
    where: {
      deletedAt: null,
      ...(looksLikeUuid ? { OR: [{ sku: key }, { id: key }] } : { sku: key }),
    },
    include: {
      brand: { select: { name: true, sixorbitId: true } },
      category: { select: { name: true, sixorbitId: true } },
      sixorbitAttributes: true,
    },
  });

  if (!product) {
    console.error(`No product found with sku or id "${key}".`);
    process.exit(1);
  }

  const input: SixOrbitPushInput = {
    sixorbitId: product.sixorbitId,
    name: product.name,
    sku: product.sku,
    hsnCode: product.hsnCode,
    gstRate: Number(product.gstRate),
    sellingRate: product.sellingRate === null ? null : Number(product.sellingRate),
    purchaseRate: product.purchaseRate === null ? null : Number(product.purchaseRate),
    mrp: product.mrp === null ? null : Number(product.mrp),
    piecesPerBox: product.piecesPerBox,
    sqftPerBox: Number(product.sqftPerBox),
    barcode: product.barcode,
    isActive: product.isActive,
    brandSixorbitId: product.brand?.sixorbitId ?? null,
    categorySixorbitId: product.category?.sixorbitId ?? null,
    attributes: product.sixorbitAttributes.map((a) => ({
      aid: a.aid,
      attr_name: a.name,
      avid: a.avid,
      attr_value: a.value,
    })),
    raw: (product.sixorbitRaw as Record<string, unknown> | null) ?? null,
  };

  const plan = buildSixOrbitPushPlan(input);
  const spec =
    plan.operation === 'create' ? SIXORBIT_TASKS.CREATE_VARIATION : SIXORBIT_TASKS.EDIT_VARIATION;

  const config = await prisma.sixOrbitConfig.findFirst({ where: { isActive: true } });
  const baseUrl = config?.baseUrl ?? '<base-url-not-configured>';

  console.log(`${product.sku} — ${product.name}`);
  console.log(
    `  brand    ${product.brand?.name ?? '—'} (${product.brand?.sixorbitId ?? 'not in SixOrbit'})`,
  );
  console.log(
    `  category ${product.category?.name ?? '—'} (${product.category?.sixorbitId ?? 'not in SixOrbit'})`,
  );
  console.log(`  isvid    ${product.sixorbitId ?? 'none yet — this would be a create'}`);
  console.log(`  status   ${product.sixorbitSyncStatus}`);
  if (product.sixorbitSyncError) console.log(`  last error: ${product.sixorbitSyncError}`);

  if (plan.blocks.length > 0) {
    console.log(`\nBLOCKED — nothing would be sent:`);
    for (const block of plan.blocks) console.log(`  · ${SIXORBIT_PUSH_BLOCK_REASONS[block]}`);
    return;
  }

  console.log(`\n${spec.method} ${plan.operation}`);
  console.log(
    buildSixOrbitUrl(baseUrl, {
      urlq: SIXORBIT_URLQ,
      version: spec.version,
      key: config?.apiKey ?? '123',
      task: spec.task,
      // The real user_id, because it is not a secret and it is worth checking. The token
      // is masked: this output is the sort of thing that gets pasted into a chat.
      user_id: config?.tokenUserId ?? '<user_id>',
      access_token: '<access_token>',
    }),
  );

  // Their POST carries one multipart field called `data`; variation tasks wrap the object
  // in a one-element array. Printed exactly as it goes on the wire.
  const body = spec.bodyShape === 'array' ? [plan.payload] : plan.payload;
  console.log(`\nmultipart field "data":`);
  console.log(JSON.stringify(body, null, 2));
}

main()
  .catch((error: unknown) => {
    // A stack trace from Prisma buries the one line that matters, and the two ways this
    // fails in practice are both environmental rather than interesting.
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Can't reach database server")) {
      console.error('Cannot reach the database. Is Postgres running (pnpm docker:up)?');
    } else if (message.includes('DATABASE_URL')) {
      console.error('DATABASE_URL is not set. Expected to find it in apps/api/.env.');
    } else {
      console.error(error);
    }
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
