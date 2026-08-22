import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditContext { userId?: number; ipAddress?: string; userAgent?: string }

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}
  write(context: AuditContext, action: string, entityType: string, entityId?: string, changes?: Record<string, { oldValue: unknown; newValue: unknown }>) {
    const safe = (value: unknown) => value == null ? null : JSON.stringify(value).slice(0, 10_000);
    const rows: Prisma.AuditLogCreateManyInput[] = changes && Object.keys(changes).length
      ? Object.entries(changes).map(([fieldName, change]) => ({ userId: context.userId, action, entityType, entityId, fieldName, oldValue: safe(change.oldValue), newValue: safe(change.newValue), ipAddress: context.ipAddress, userAgent: context.userAgent }))
      : [{ userId: context.userId, action, entityType, entityId, ipAddress: context.ipAddress, userAgent: context.userAgent }];
    return this.prisma.auditLog.createMany({ data: rows });
  }
  async list(page = 1, limit = 50, action?: string) {
    const where: Prisma.AuditLogWhereInput = action ? { action } : {};
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { success: true, data: data.map((row) => ({ ...row, id: row.id.toString() })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }
}
