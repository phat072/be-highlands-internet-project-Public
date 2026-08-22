import { Module } from '@nestjs/common';
import { EncryptionService } from '../common/encryption.service';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';
@Module({ controllers: [SitesController], providers: [SitesService, EncryptionService], exports: [SitesService] })
export class SitesModule {}
