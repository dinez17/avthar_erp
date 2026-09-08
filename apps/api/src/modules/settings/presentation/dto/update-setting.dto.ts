import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

/**
 * Upper bound on a setting value.
 *
 * 2000 characters suited a world where every setting was a currency code or a date
 * format. app.logo holds the company logo as a data URI, which is base64 and so
 * roughly a third larger than the image — a modest 150KB logo is already 200,000
 * characters.
 *
 * This is the outer wall, not the policy: the real per-key rule lives in the handler,
 * which is where "app.logo must be an image and under 200KB" can be said precisely.
 * A single MaxLength cannot express that, and raising it alone would let any setting
 * grow to a quarter of a megabyte.
 */
const MAX_VALUE_LENGTH = 400_000;

export class UpdateSettingDto {
  @ApiProperty({ example: 'INR' })
  @IsString()
  @MaxLength(MAX_VALUE_LENGTH)
  value!: string;

  @ApiProperty({ description: 'Optimistic concurrency token last read by the client' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
