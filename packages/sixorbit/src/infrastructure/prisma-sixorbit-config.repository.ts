import { type PrismaClient } from '@prisma/client';
import type { SixOrbitConfig } from '@prisma/client';
import { ConflictError } from '@tiles-erp/shared';
import type { SixOrbitConfigItem, UUID } from '@tiles-erp/shared-types';
import type {
  SaveSixOrbitConfigData,
  SixOrbitConfigRepository,
  SixOrbitCredentials,
  SixOrbitStoredToken,
} from '../domain/sixorbit-config.repository';
import { type SixOrbitCryptoService } from './sixorbit-crypto.service';

/**
 * Maps a row to what the outside world may see.
 *
 * The password columns are not merely omitted from the object — they are never selected
 * into it. `hasPassword` is the only thing the UI needs, and it is derived rather than
 * exposing even the ciphertext.
 */
const toItem = (row: SixOrbitConfig): SixOrbitConfigItem => ({
  id: row.id,
  baseUrl: row.baseUrl,
  apiKey: row.apiKey,
  email: row.email,
  hasPassword: row.passwordCipher !== '',
  requestTimeoutMs: row.requestTimeoutMs,
  isActive: row.isActive,
  notes: row.notes,
  tokenFetchedAt: row.tokenFetchedAt?.toISOString() ?? null,
  updatedAt: row.updatedAt.toISOString(),
  version: row.version,
});

export class PrismaSixOrbitConfigRepository implements SixOrbitConfigRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly crypto: SixOrbitCryptoService,
  ) {}

  async findCurrent(): Promise<SixOrbitConfigItem | null> {
    const row = await this.findCurrentRow();
    return row ? toItem(row) : null;
  }

  async save(data: SaveSixOrbitConfigData, actorId: UUID): Promise<SixOrbitConfigItem> {
    // Deliberately the current row, not the *active* one: if someone switches the
    // integration off and saves again, that must update the row they were looking at
    // rather than quietly creating a second set of credentials.
    const existing = await this.findCurrentRow();

    // Encrypt before touching the database, so a bad key fails without leaving a row that
    // claims to have a password it cannot decrypt.
    const secret = data.password ? this.crypto.encrypt(data.password) : null;

    if (!existing) {
      const created = await this.prisma.sixOrbitConfig.create({
        data: {
          baseUrl: data.baseUrl,
          apiKey: data.apiKey,
          email: data.email,
          passwordCipher: secret?.cipher ?? '',
          passwordIv: secret?.iv ?? '',
          passwordTag: secret?.tag ?? '',
          requestTimeoutMs: data.requestTimeoutMs,
          isActive: data.isActive,
          notes: data.notes,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
      return toItem(created);
    }

    const updated = await this.prisma.sixOrbitConfig.updateMany({
      where: { id: existing.id, version: data.version ?? existing.version },
      data: {
        baseUrl: data.baseUrl,
        apiKey: data.apiKey,
        email: data.email,
        ...(secret
          ? {
              passwordCipher: secret.cipher,
              passwordIv: secret.iv,
              passwordTag: secret.tag,
            }
          : {}),
        requestTimeoutMs: data.requestTimeoutMs,
        isActive: data.isActive,
        notes: data.notes,
        updatedBy: actorId,
        version: { increment: 1 },
        // Any change to the connection details invalidates the cached session: a new URL
        // or a new password means the old token is meaningless at best and belongs to the
        // wrong tenant at worst.
        accessToken: null,
        tokenUserId: null,
        tokenFetchedAt: null,
      },
    });

    if (updated.count === 0) {
      throw new ConflictError(
        'SixOrbit settings were changed by someone else. Reload and try again.',
      );
    }

    const row = await this.prisma.sixOrbitConfig.findUniqueOrThrow({ where: { id: existing.id } });
    return toItem(row);
  }

  async findActiveCredentials(): Promise<SixOrbitCredentials | null> {
    const row = await this.findCurrentRow();
    // No password stored, or the integration switched off — either way there is nothing
    // to call. Null rather than an error, so callers decide how loudly to complain.
    if (!row || !row.isActive || row.passwordCipher === '') return null;
    return {
      id: row.id,
      baseUrl: row.baseUrl,
      apiKey: row.apiKey,
      email: row.email,
      password: this.crypto.decrypt({
        cipher: row.passwordCipher,
        iv: row.passwordIv,
        tag: row.passwordTag,
      }),
      requestTimeoutMs: row.requestTimeoutMs,
    };
  }

  async findStoredToken(configId: UUID): Promise<SixOrbitStoredToken | null> {
    const row = await this.prisma.sixOrbitConfig.findUnique({ where: { id: configId } });
    if (!row?.accessToken || !row.tokenUserId || !row.tokenFetchedAt) return null;
    return {
      accessToken: row.accessToken,
      tokenUserId: row.tokenUserId,
      tokenFetchedAt: row.tokenFetchedAt,
    };
  }

  async saveToken(configId: UUID, token: SixOrbitStoredToken): Promise<void> {
    await this.prisma.sixOrbitConfig.update({
      where: { id: configId },
      data: {
        accessToken: token.accessToken,
        tokenUserId: token.tokenUserId,
        tokenFetchedAt: token.tokenFetchedAt,
      },
    });
  }

  async clearToken(configId: UUID): Promise<void> {
    await this.prisma.sixOrbitConfig.update({
      where: { id: configId },
      data: { accessToken: null, tokenUserId: null, tokenFetchedAt: null },
    });
  }

  private findCurrentRow(): Promise<SixOrbitConfig | null> {
    return this.prisma.sixOrbitConfig.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }
}
