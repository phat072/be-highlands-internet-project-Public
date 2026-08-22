import { Injectable } from '@nestjs/common';
import { HighlandsStatus, InfrastructureStatus, IssueStatus, ReminderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}
  async summary() {
    const active = { deletedAt: null } as const;
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 86_400_000);
    const [total, done, onProgress, pending, blocked, online, configCompleted, outdoorCompleted, indoorCompleted, overdue, dueSoon, openReminders] = await this.prisma.$transaction([
      this.prisma.site.count({ where: active }),
      this.prisma.site.count({ where: { ...active, highlandsStatus: HighlandsStatus.DONE } }),
      this.prisma.site.count({ where: { ...active, highlandsStatus: HighlandsStatus.ON_PROGRESS } }),
      this.prisma.site.count({ where: { ...active, highlandsStatus: HighlandsStatus.PENDING } }),
      this.prisma.site.count({ where: { ...active, OR: [{ issueStatus: IssueStatus.OPEN }, { outdoorStatus: InfrastructureStatus.BLOCKED }, { indoorStatus: InfrastructureStatus.BLOCKED }] } }),
      this.prisma.site.count({ where: { ...active, onlineDateTime: { not: null } } }),
      this.prisma.site.count({ where: { ...active, configurationCompletedAt: { not: null } } }),
      this.prisma.site.count({ where: { ...active, outdoorStatus: InfrastructureStatus.COMPLETED } }),
      this.prisma.site.count({ where: { ...active, indoorStatus: InfrastructureStatus.COMPLETED } }),
      this.prisma.site.count({ where: { ...active, targetOnlineAt: { lt: now }, onlineDateTime: null, highlandsStatus: { notIn: [HighlandsStatus.DONE, HighlandsStatus.CANCELLED] } } }),
      this.prisma.site.count({ where: { ...active, targetOnlineAt: { gte: now, lte: inSevenDays }, onlineDateTime: null } }),
      this.prisma.reminder.count({ where: { status: ReminderStatus.OPEN } }),
    ]);
    return { total, done, onProgress, pending, cancelled: total - done - onProgress - pending, blocked, online, notOnline: total - online, configCompleted, outdoorCompleted, indoorCompleted, overdue, dueSoon, openReminders };
  }
  byStatus() { return this.prisma.site.groupBy({ by: ['highlandsStatus'], where: { deletedAt: null }, _count: { _all: true } }); }
  byProvince() { return this.prisma.site.groupBy({ by: ['province'], where: { deletedAt: null }, _count: { _all: true }, orderBy: { _count: { province: 'desc' } }, take: 12 }); }
  async progress() {
    const s = await this.summary();
    return [
      { name: 'Outdoor hoàn tất', value: s.outdoorCompleted }, { name: 'Indoor hoàn tất', value: s.indoorCompleted },
      { name: 'Đã Online', value: s.online }, { name: 'Hoàn tất cấu hình', value: s.configCompleted },
    ];
  }
  async attention() {
    return this.prisma.site.findMany({ where: { deletedAt: null, highlandsStatus: { notIn: [HighlandsStatus.DONE, HighlandsStatus.CANCELLED] }, OR: [{ issueStatus: IssueStatus.OPEN }, { targetOnlineAt: { lt: new Date() }, onlineDateTime: null }, { outdoorStatus: InfrastructureStatus.BLOCKED }, { indoorStatus: InfrastructureStatus.BLOCKED }] }, select: { id: true, storeName: true, province: true, highlandsPicName: true, issueStatus: true, issueContent: true, targetOnlineAt: true, outdoorStatus: true, indoorStatus: true }, orderBy: { targetOnlineAt: 'asc' }, take: 20 });
  }
}
