import { Global, Module } from '@nestjs/common';
import { DocumentNumberService } from './document-number.service';

/**
 * Document numbering, global because every module that writes a document needs it and
 * threading it through each module's imports would be noise.
 */
@Global()
@Module({
  providers: [DocumentNumberService],
  exports: [DocumentNumberService],
})
export class NumberingModule {}
