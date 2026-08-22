import { Module } from '@nestjs/common';
import { EncryptionService } from '../common/encryption.service';
import { ImportExportController } from './import-export.controller';
import { ImportExportService } from './import-export.service';
@Module({ controllers: [ImportExportController], providers: [ImportExportService, EncryptionService] })
export class ImportExportModule {}
