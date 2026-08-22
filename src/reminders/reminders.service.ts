import { Injectable, NotFoundException } from '@nestjs/common';
import { ReminderStatus, RoleName } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../common/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReminderDto, UpdateReminderDto } from './dto/reminder.dto';
@Injectable()
export class RemindersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  list(user: AuthUser, status?: ReminderStatus) {
    return this.prisma.reminder.findMany({ where: { status, assigneeId: user.role === RoleName.STAFF ? user.id : undefined }, include: { site: { select: { id: true, storeName: true, province: true } }, assignee: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } } }, orderBy: [{ status: 'asc' }, { dueAt: 'asc' }] });
  }
  async create(dto: CreateReminderDto, user: AuthUser) {
    const reminder = await this.prisma.reminder.create({ data: { siteId: dto.siteId, title: dto.title.trim(), description: dto.description?.trim(), dueAt: new Date(dto.dueAt), priority: dto.priority, assigneeId: dto.assigneeId, createdById: user.id }, include: { site: true, assignee: { select: { id: true, name: true } } } });
    await this.audit.write({ userId: user.id }, 'CREATE_REMINDER', 'REMINDER', String(reminder.id));
    return reminder;
  }
  async update(id: number, dto: UpdateReminderDto, user: AuthUser) {
    const found = await this.prisma.reminder.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Không tìm thấy nhắc hẹn');
    const reminder = await this.prisma.reminder.update({ where: { id }, data: { ...dto, dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined, completedAt: dto.status === ReminderStatus.DONE ? new Date() : dto.status === ReminderStatus.OPEN ? null : undefined } });
    await this.audit.write({ userId: user.id }, 'UPDATE_REMINDER', 'REMINDER', String(id));
    return reminder;
  }
}
