import { Controller, Get, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { Roles } from '../common/roles.decorator';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@Roles(RoleName.ADMIN, RoleName.PROJECT_MANAGER)
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() list(@Query('page') page = '1', @Query('limit') limit = '50', @Query('action') action?: string) {
    return this.audit.list(Math.max(1, Number(page)), Math.min(100, Number(limit)), action);
  }
}
