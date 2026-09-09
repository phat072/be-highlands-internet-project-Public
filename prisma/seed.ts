import { HighlandsStatus, PrismaClient, RoleName } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required for seeding');

  const roleDescriptions: Record<RoleName, string> = {
    ADMIN: 'Toàn quyền hệ thống', PROJECT_MANAGER: 'Quản lý toàn bộ dự án', STAFF: 'Cập nhật tiến độ được phân công', VIEWER: 'Chỉ xem dữ liệu',
  };
  for (const name of Object.values(RoleName)) await prisma.role.upsert({ where: { name }, update: { description: roleDescriptions[name] }, create: { name, description: roleDescriptions[name] } });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.ADMIN } });
  const admin = await prisma.user.upsert({ where: { email: adminEmail }, update: {}, create: { name: 'Quản trị dự án', email: adminEmail, passwordHash: await argon2.hash(adminPassword), roleId: adminRole.id, mustChangePassword: true } });
  const types = new Map<string, number>();
  for (const name of ['Core Store', 'Small Core', 'Small Store', 'Flagship Store', 'Other']) { const row = await prisma.storeType.upsert({ where: { name }, update: {}, create: { name } }); types.set(name, row.id); }
  if (process.env.SEED_DEMO_DATA !== 'true' || await prisma.site.count()) return;
  const sites = [
    { highlandsStatus: HighlandsStatus.DONE, province: 'HCM', taxCode: '0309965814', storeName: 'Ree Tower HCM', address: '9 Đoàn Văn Bơ, Phường Xóm Chiếu, TP Hồ Chí Minh', sitePossessionDate: new Date('2026-07-22'), highlandsPicName: 'Huy', outdoorStatus: 'COMPLETED' as const, indoorStatus: 'COMPLETED' as const, onlineDateTime: new Date('2026-07-29T09:00:00+07:00'), configurationCompletedAt: new Date('2026-07-29T11:00:00+07:00') },
    { highlandsStatus: HighlandsStatus.ON_PROGRESS, province: 'HCM', taxCode: '0309965814', storeTypeId: types.get('Core Store'), storeName: '14B1 Ngo Tat To HCM', address: '14B1 Ngô Tất Tố, Phường Thạnh Mỹ Tây, TP Hồ Chí Minh', sitePossessionDate: new Date('2026-07-18'), highlandsPicName: 'Phương Duy', targetOnlineAt: new Date('2026-08-24T17:00:00+07:00') },
    { highlandsStatus: HighlandsStatus.ON_PROGRESS, province: 'DAK LAK', taxCode: '0309965814-046', storeTypeId: types.get('Core Store'), storeName: '191 Nguyen Hue Phu Yen', address: '191 Nguyễn Huệ, Tuy Hòa, Dak Lak', sitePossessionDate: new Date('2026-07-17'), highlandsPicName: 'Báu', issueStatus: 'OPEN' as const, issueContent: 'Chờ Highlands xác nhận vị trí modem' },
    { highlandsStatus: HighlandsStatus.ON_PROGRESS, province: 'HCM', taxCode: '0309965814', storeTypeId: types.get('Core Store'), storeName: 'Origami VH Grand Park D9', address: 'Cửa hàng 1.13-14, Tầng trệt, Tòa S7-05, Vinhomes Grand Park, Phường Long Bình, TP Hồ Chí Minh', sitePossessionDate: new Date('2026-07-10'), highlandsPicName: 'Sinh', outdoorStatus: 'DEPLOYING' as const },
    { highlandsStatus: HighlandsStatus.ON_PROGRESS, province: 'AN GIANG', taxCode: '0309965814-033', storeTypeId: types.get('Core Store'), storeName: '316 Tran Hung Dao Long Xuyen', address: '316 Trần Hưng Đạo, Phường Long Xuyên, Tỉnh An Giang', sitePossessionDate: new Date('2026-08-01'), highlandsPicName: 'Nghĩa' },
  ];
  for (const site of sites) await prisma.site.create({ data: { ...site, createdById: admin.id, updatedById: admin.id } });
  const site = await prisma.site.findFirst({ where: { storeName: '14B1 Ngo Tat To HCM' } });
  if (site) await prisma.reminder.create({ data: { siteId: site.id, title: 'Chốt lịch khảo sát và kéo cáp', dueAt: new Date('2026-08-23T09:00:00+07:00'), priority: 'HIGH', assigneeId: admin.id, createdById: admin.id } });
}

main().finally(() => prisma.$disconnect());
