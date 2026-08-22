import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { EncryptionService } from '../common/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddNoteDto, CreateSiteDto, QuerySitesDto, QuickUpdateDto, UpdateSiteDto } from './dto/site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService, private readonly encryption: EncryptionService, private readonly audit: AuditService) {}
  private include = { storeType: true, createdBy: { select: { id: true, name: true } }, updatedBy: { select: { id: true, name: true } } } as const;
  private sanitize<T extends { pppoePasswordEncrypted?: string | null }>(site: T) {
    const { pppoePasswordEncrypted: _secret, ...safe } = site;
    return { ...safe, hasPppoePassword: Boolean(_secret) };
  }
  private where(q: QuerySitesDto): Prisma.SiteWhereInput {
    return {
      deletedAt: null,
      highlandsStatus: q.status,
      province: q.province,
      storeTypeId: q.storeTypeId,
      onlineDateTime: q.online === undefined ? undefined : q.online ? { not: null } : null,
      sitePossessionDate: q.possessionFrom || q.possessionTo ? { gte: q.possessionFrom ? new Date(q.possessionFrom) : undefined, lte: q.possessionTo ? new Date(q.possessionTo) : undefined } : undefined,
      OR: q.search ? [
        { storeName: { contains: q.search } }, { address: { contains: q.search } }, { province: { contains: q.search } },
        { taxCode: { contains: q.search } }, { ftelContractNumber: { contains: q.search } }, { pppoeUsername: { contains: q.search } },
        { highlandsPicName: { contains: q.search } }, { highlandsPicPhone: { contains: q.search } },
      ] : undefined,
    };
  }
  async list(q: QuerySitesDto) {
    const where = this.where(q);
    const allowedSort = ['sitePossessionDate', 'onlineDateTime', 'infrastructureCompletedDate', 'province', 'storeName', 'createdAt', 'updatedAt'];
    const sortBy = allowedSort.includes(q.sortBy) ? q.sortBy : 'updatedAt';
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.site.findMany({ where, include: this.include, orderBy: { [sortBy]: q.sortOrder }, skip: (q.page - 1) * q.limit, take: q.limit }),
      this.prisma.site.count({ where }),
    ]);
    return { success: true, data: rows.map((row) => this.sanitize(row)), pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) } };
  }
  async metadata() {
    const [provinces, storeTypes] = await Promise.all([
      this.prisma.site.findMany({ where: { deletedAt: null }, select: { province: true }, distinct: ['province'], orderBy: { province: 'asc' } }),
      this.prisma.storeType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    ]);
    return { provinces: provinces.map((x) => x.province), storeTypes };
  }
  async get(id: number) {
    const site = await this.prisma.site.findFirst({ where: { id, deletedAt: null }, include: { ...this.include, notes: { include: { createdBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } }, reminders: { include: { assignee: { select: { id: true, name: true } } }, orderBy: { dueAt: 'asc' } } } });
    if (!site) throw new NotFoundException('Không tìm thấy site');
    return this.sanitize(site);
  }
  private data(dto: CreateSiteDto | UpdateSiteDto, actorId: number, create = false): Prisma.SiteUncheckedCreateInput | Prisma.SiteUncheckedUpdateInput {
    const date = (value?: string) => value ? new Date(value) : undefined;
    return {
      projectType: dto.projectType,
      highlandsStatus: dto.highlandsStatus,
      province: dto.province?.trim(), taxCode: dto.taxCode?.trim(), storeTypeId: dto.storeTypeId,
      storeName: dto.storeName?.trim(), address: dto.address?.trim(), sitePossessionDate: date(dto.sitePossessionDate),
      highlandsPicName: dto.highlandsPicName?.trim(), highlandsPicPhone: dto.highlandsPicPhone?.trim(),
      viettelSignalHandoverDate: date(dto.viettelSignalHandoverDate), ftelContractNumber: dto.ftelContractNumber?.trim(),
      pppoeUsername: dto.pppoeUsername?.trim(), pppoePasswordEncrypted: dto.pppoePassword ? this.encryption.encrypt(dto.pppoePassword) : undefined,
      onlineDateTime: date(dto.onlineDateTime), configurationCompletedAt: date(dto.configurationCompletedAt),
      outdoorStatus: dto.outdoorStatus, indoorStatus: dto.indoorStatus, infrastructureCompletedDate: date(dto.infrastructureCompletedDate),
      surveyContactPhone: dto.surveyContactPhone?.trim(), note: dto.note?.trim(), issueStatus: dto.issueStatus, issueContent: dto.issueContent?.trim(), targetOnlineAt: date(dto.targetOnlineAt),
      updatedById: actorId, ...(create ? { createdById: actorId } : {}),
    };
  }
  private async duplicate(dto: CreateSiteDto, excludeId?: number) {
    return this.prisma.site.findFirst({ where: { id: excludeId ? { not: excludeId } : undefined, deletedAt: null, storeName: dto.storeName.trim(), address: dto.address.trim() }, select: { id: true, storeName: true, address: true } });
  }
  async create(dto: CreateSiteDto, user: AuthUser) {
    const duplicate = await this.duplicate(dto);
    if (duplicate && !dto.duplicateOverride) throw new ConflictException({ message: 'Có khả năng site này đã tồn tại', duplicate });
    const site = await this.prisma.site.create({ data: this.data(dto, user.id, true) as Prisma.SiteUncheckedCreateInput, include: this.include });
    await this.audit.write({ userId: user.id }, 'CREATE_SITE', 'SITE', String(site.id));
    return this.sanitize(site);
  }
  async update(id: number, dto: UpdateSiteDto, user: AuthUser) {
    const current = await this.get(id);
    if (user.role === RoleName.STAFF) {
      const allowed = new Set(['highlandsStatus', 'outdoorStatus', 'indoorStatus', 'onlineDateTime', 'configurationCompletedAt', 'infrastructureCompletedDate', 'issueStatus', 'issueContent', 'note', 'targetOnlineAt']);
      const forbidden = Object.keys(dto).filter((key) => !allowed.has(key) && key !== 'duplicateOverride');
      if (forbidden.length) throw new ForbiddenException(`STAFF không được sửa: ${forbidden.join(', ')}`);
    }
    const updated = await this.prisma.site.update({ where: { id }, data: this.data(dto, user.id, false) as Prisma.SiteUncheckedUpdateInput, include: this.include });
    const changes: Record<string, { oldValue: unknown; newValue: unknown }> = {};
    for (const key of Object.keys(dto)) if (key !== 'pppoePassword' && key !== 'duplicateOverride' && JSON.stringify((current as Record<string, unknown>)[key]) !== JSON.stringify((updated as unknown as Record<string, unknown>)[key])) changes[key] = { oldValue: (current as Record<string, unknown>)[key], newValue: (updated as unknown as Record<string, unknown>)[key] };
    if (dto.pppoePassword) changes.pppoePassword = { oldValue: '[REDACTED]', newValue: '[REDACTED]' };
    await this.audit.write({ userId: user.id }, 'UPDATE_SITE', 'SITE', String(id), changes);
    return this.sanitize(updated);
  }
  quickUpdate(id: number, dto: QuickUpdateDto, user: AuthUser) { return this.update(id, dto as UpdateSiteDto, user); }
  async remove(id: number, user: AuthUser) {
    await this.get(id);
    await this.prisma.site.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.write({ userId: user.id }, 'DELETE_SITE', 'SITE', String(id));
    return { deleted: true };
  }
  async revealPassword(id: number, user: AuthUser) {
    if (user.role !== RoleName.ADMIN) throw new ForbiddenException('Bạn không có quyền xem PPPoE password');
    const site = await this.prisma.site.findFirst({ where: { id, deletedAt: null }, select: { pppoePasswordEncrypted: true } });
    if (!site) throw new NotFoundException('Không tìm thấy site');
    await this.audit.write({ userId: user.id }, 'VIEW_PPPOE_PASSWORD', 'SITE', String(id));
    return { password: site.pppoePasswordEncrypted ? this.encryption.decrypt(site.pppoePasswordEncrypted) : null };
  }
  async addNote(id: number, dto: AddNoteDto, user: AuthUser) {
    await this.get(id);
    const note = await this.prisma.siteNote.create({ data: { siteId: id, content: dto.content.trim(), createdById: user.id }, include: { createdBy: { select: { id: true, name: true } } } });
    await this.audit.write({ userId: user.id }, 'ADD_SITE_NOTE', 'SITE', String(id));
    return note;
  }
}
