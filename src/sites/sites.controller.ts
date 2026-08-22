import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { Roles } from '../common/roles.decorator';
import { AddNoteDto, CreateSiteDto, QuerySitesDto, QuickUpdateDto, UpdateSiteDto } from './dto/site.dto';
import { SitesService } from './sites.service';

@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}
  @Get() list(@Query() query: QuerySitesDto) { return this.sites.list(query); }
  @Get('metadata') metadata() { return this.sites.metadata(); }
  @Post() @Roles(RoleName.ADMIN, RoleName.PROJECT_MANAGER, RoleName.STAFF) create(@Body() dto: CreateSiteDto, @CurrentUser() user: AuthUser) { return this.sites.create(dto, user); }
  @Get(':id') get(@Param('id', ParseIntPipe) id: number) { return this.sites.get(id); }
  @Patch(':id') @Roles(RoleName.ADMIN, RoleName.PROJECT_MANAGER, RoleName.STAFF) update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSiteDto, @CurrentUser() user: AuthUser) { return this.sites.update(id, dto, user); }
  @Patch(':id/quick') @Roles(RoleName.ADMIN, RoleName.PROJECT_MANAGER, RoleName.STAFF) quick(@Param('id', ParseIntPipe) id: number, @Body() dto: QuickUpdateDto, @CurrentUser() user: AuthUser) { return this.sites.quickUpdate(id, dto, user); }
  @Delete(':id') @Roles(RoleName.ADMIN) remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.sites.remove(id, user); }
  @Get(':id/pppoe-password') @Roles(RoleName.ADMIN) password(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) { return this.sites.revealPassword(id, user); }
  @Post(':id/notes') @Roles(RoleName.ADMIN, RoleName.PROJECT_MANAGER, RoleName.STAFF) note(@Param('id', ParseIntPipe) id: number, @Body() dto: AddNoteDto, @CurrentUser() user: AuthUser) { return this.sites.addNote(id, dto, user); }
}
