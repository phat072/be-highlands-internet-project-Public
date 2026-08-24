import { Body, Controller, Get, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RoleName } from '@prisma/client';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { QuerySitesDto } from '../sites/dto/site.dto';
import { ImportExportService, ImportRow } from './import-export.service';
@Controller('sites')
export class ImportExportController {
  constructor(private readonly service: ImportExportService) {}
  @Post('import/preview') @Roles(RoleName.ADMIN) @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } })) preview(@UploadedFile() file?: { buffer: Buffer }) { if (!file) throw new Error('Thiếu file'); return this.service.preview(file.buffer); }
  @Post('import/confirm') @Roles(RoleName.ADMIN) confirm(@Body('rows') rows: ImportRow[], @CurrentUser() user: AuthUser) { return this.service.confirm(rows, user.id); }
  @Get('import/template') @Roles(RoleName.ADMIN) async template(@Res() res: Response) {
    const buffer = await this.service.template();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Highlands_Import_Template.xlsx"');
    res.send(buffer);
  }
  @Get('export') @Roles(RoleName.ADMIN, RoleName.PROJECT_MANAGER) async export(@Query() query: QuerySitesDto, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const buffer = await this.service.export(query, user.id); const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="Highlands_Internet_Deployment_${date}.xlsx"`); res.send(buffer);
  }
}
