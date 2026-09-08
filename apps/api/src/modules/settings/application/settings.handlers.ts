import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';
import { ValidationError } from '@tiles-erp/shared';
import type { BrandingInfo, SettingItem, UUID } from '@tiles-erp/shared-types';
import { SETTINGS_REPOSITORY, type SettingsRepository } from '../domain/settings.repository';

/**
 * How large the encoded logo may be, in characters.
 *
 * ~200KB of base64, which is roughly a 150KB image. Every response carrying branding
 * ships this string, so it is kept small deliberately. The Settings screen enforces
 * the same limit before uploading; this is the one that actually binds, since a
 * client-side check protects nobody who calls the API directly.
 */
const MAX_LOGO_CHARS = 200 * 1024;

/** Only image data URIs. Blocks a link, a script, or a path to somewhere on disk. */
const IMAGE_DATA_URI = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

/**
 * Per-key rules the generic DTO cannot express.
 *
 * The DTO's MaxLength is one number for every setting; "app.logo must be an image
 * and under 200KB, while app.currency must be three letters" needs to be said here.
 */
function assertValueIsAllowed(key: string, value: string): void {
  if (key !== 'app.logo') return;

  // Empty is how "no logo" is stored — the column is NOT NULL.
  if (value === '') return;

  if (value.length > MAX_LOGO_CHARS) {
    throw new ValidationError(
      `The logo is ${Math.round(value.length / 1024)}KB once encoded, over the ${
        MAX_LOGO_CHARS / 1024
      }KB limit. Use a smaller image, or an SVG.`,
    );
  }

  if (!IMAGE_DATA_URI.test(value)) {
    throw new ValidationError(
      'The logo must be a PNG, JPEG, WebP or SVG image. Upload it from Settings rather than setting this value by hand.',
    );
  }
}

export class ListSettingsQuery {}

export class GetBrandingQuery {}

export class UpdateSettingCommand {
  constructor(
    public readonly key: string,
    public readonly value: string,
    public readonly version: number,
    public readonly actorId: UUID,
  ) {}
}

@QueryHandler(ListSettingsQuery)
export class ListSettingsHandler implements IQueryHandler<ListSettingsQuery, SettingItem[]> {
  constructor(@Inject(SETTINGS_REPOSITORY) private readonly settings: SettingsRepository) {}

  execute(): Promise<SettingItem[]> {
    return this.settings.listAll();
  }
}

/**
 * Name and logo only, for callers who cannot read the settings table.
 *
 * Reads the whole (tiny) table and picks two keys rather than adding a
 * fetch-by-key port: the alternative is a repository method that exists for one
 * caller. Nothing beyond those two keys is returned, so no setting leaks to an
 * unauthenticated caller.
 */
@QueryHandler(GetBrandingQuery)
export class GetBrandingHandler implements IQueryHandler<GetBrandingQuery, BrandingInfo> {
  constructor(@Inject(SETTINGS_REPOSITORY) private readonly settings: SettingsRepository) {}

  async execute(): Promise<BrandingInfo> {
    const all = await this.settings.listAll();
    const valueOf = (key: string): string => all.find((s) => s.key === key)?.value.trim() ?? '';
    const logo = valueOf('app.logo');

    return {
      appName: valueOf('app.name') || 'Tiles ERP',
      // An empty string is how "no logo" is stored, since the column is not nullable.
      logo: logo === '' ? null : logo,
    };
  }
}

@CommandHandler(UpdateSettingCommand)
export class UpdateSettingHandler implements ICommandHandler<UpdateSettingCommand, SettingItem> {
  constructor(@Inject(SETTINGS_REPOSITORY) private readonly settings: SettingsRepository) {}

  execute(command: UpdateSettingCommand): Promise<SettingItem> {
    assertValueIsAllowed(command.key, command.value);

    return this.settings.updateValue(
      command.key,
      command.value,
      command.version,
      command.actorId,
    );
  }
}
