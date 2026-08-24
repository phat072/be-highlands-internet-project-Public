import { BadRequestException, Injectable } from '@nestjs/common';
import { HighlandsStatus, InfrastructureStatus, Prisma } from '@prisma/client';
import ExcelJS = require('exceljs');
import { AuditService } from '../audit/audit.service';
import { EncryptionService } from '../common/encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuerySitesDto } from '../sites/dto/site.dto';

export interface ImportRow {
  rowNumber: number; projectType: string; highlandsStatus: string; province: string; taxCode?: string; storeType?: string;
  storeName: string; address: string; sitePossessionDate?: string; highlandsPicName?: string; highlandsPicPhone?: string;
  viettelSignalHandoverDate?: string; ftelContractNumber?: string; pppoeUsername?: string; pppoePassword?: string;
  onlineDateTime?: string; configurationCompletedAt?: string; outdoorStatus?: string; indoorStatus?: string;
  infrastructureCompletedDate?: string; surveyContactPhone?: string; note?: string; errors: string[];
}

@Injectable()
export class ImportExportService {
  constructor(private readonly prisma: PrismaService, private readonly encryption: EncryptionService, private readonly audit: AuditService) {}
  private text(value: ExcelJS.CellValue): string { return String(value && typeof value === 'object' && 'text' in value ? value.text : value ?? '').trim(); }
  private date(value: ExcelJS.CellValue): string | undefined {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'number') return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString();
    const text = this.text(value); if (!text) return undefined;
    const parts = text.split(/[\/.\-]/).map(Number); if (parts.length === 3 && parts[0] <= 31) return new Date(Date.UTC(parts[2], parts[1] - 1, parts[0])).toISOString();
    const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }
  private status(value: string) { const normalized = value.toLowerCase(); return normalized === 'done' ? HighlandsStatus.DONE : normalized.includes('progress') ? HighlandsStatus.ON_PROGRESS : normalized === 'cancelled' ? HighlandsStatus.CANCELLED : HighlandsStatus.PENDING; }
  private infra(value: string) { const n = value.toLowerCase(); if (n.includes('hoàn') || n === 'done' || n === 'completed') return InfrastructureStatus.COMPLETED; if (n.includes('khảo')) return InfrastructureStatus.SURVEYING; if (n.includes('triển')) return InfrastructureStatus.DEPLOYING; if (n.includes('vướng') || n === 'blocked') return InfrastructureStatus.BLOCKED; return InfrastructureStatus.NOT_STARTED; }
  private automaticStatus(row: ImportRow) {
    const complete = Boolean(row.sitePossessionDate && row.outdoorStatus === 'COMPLETED' && row.indoorStatus === 'COMPLETED' && row.viettelSignalHandoverDate && row.onlineDateTime && row.configurationCompletedAt);
    if (complete) return HighlandsStatus.DONE;
    return row.highlandsStatus === HighlandsStatus.DONE ? HighlandsStatus.ON_PROGRESS : row.highlandsStatus as HighlandsStatus;
  }
  async preview(buffer: Buffer) {
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0]; if (!sheet) throw new BadRequestException('File Excel không có worksheet');
    let headerRow = 0;
    sheet.eachRow({ includeEmpty: false }, (row, number) => { const values = Array.isArray(row.values) ? row.values : Object.values(row.values); if (!headerRow && values.some((v: ExcelJS.CellValue) => this.text(v).toLowerCase() === 'status')) headerRow = number; });
    if (!headerRow) throw new BadRequestException('Không tìm thấy dòng tiêu đề Status');
    const rows: ImportRow[] = [];
    for (let n = headerRow + 2; n <= sheet.rowCount; n++) {
      const r = sheet.getRow(n); const storeName = this.text(r.getCell(6).value); const address = this.text(r.getCell(7).value); const province = this.text(r.getCell(3).value);
      if (!storeName && !address && !province) continue;
      const errors: string[] = []; if (!storeName) errors.push('Thiếu Store Name'); if (!address) errors.push('Thiếu Address'); if (!province) errors.push('Thiếu Province');
      rows.push({ rowNumber: n, projectType: this.text(r.getCell(1).value) || 'NSO', highlandsStatus: this.status(this.text(r.getCell(2).value)), province, taxCode: this.text(r.getCell(4).value) || undefined, storeType: this.text(r.getCell(5).value) || undefined, storeName, address, sitePossessionDate: this.date(r.getCell(8).value), highlandsPicName: this.text(r.getCell(9).value) || undefined, highlandsPicPhone: this.text(r.getCell(10).value) || undefined, viettelSignalHandoverDate: this.date(r.getCell(11).value), ftelContractNumber: this.text(r.getCell(12).value) || undefined, pppoeUsername: this.text(r.getCell(13).value) || undefined, pppoePassword: this.text(r.getCell(14).value) || undefined, onlineDateTime: this.date(r.getCell(15).value), configurationCompletedAt: this.date(r.getCell(16).value), outdoorStatus: this.infra(this.text(r.getCell(17).value)), indoorStatus: this.infra(this.text(r.getCell(18).value)), infrastructureCompletedDate: this.date(r.getCell(19).value), surveyContactPhone: this.text(r.getCell(20).value) || undefined, note: this.text(r.getCell(21).value) || undefined, errors });
    }
    return { rows, valid: rows.filter((r) => !r.errors.length).length, invalid: rows.filter((r) => r.errors.length).length };
  }
  async confirm(rows: ImportRow[], userId: number) {
    const valid = rows.filter((r) => !r.errors?.length);
    const result = await this.prisma.$transaction(async (tx) => {
      let imported = 0; let skipped = 0;
      for (const row of valid) {
        const duplicate = await tx.site.findFirst({ where: { deletedAt: null, storeName: row.storeName.trim(), address: row.address.trim() } });
        if (duplicate) { skipped++; continue; }
        const storeType = row.storeType ? await tx.storeType.upsert({ where: { name: row.storeType.trim() }, update: { isActive: true }, create: { name: row.storeType.trim() } }) : null;
        await tx.site.create({ data: { projectType: row.projectType === 'NSO' ? 'NSO' : 'OTHER', highlandsStatus: this.automaticStatus(row), province: row.province.trim(), taxCode: row.taxCode?.trim(), storeTypeId: storeType?.id, storeName: row.storeName.trim(), address: row.address.trim(), sitePossessionDate: row.sitePossessionDate ? new Date(row.sitePossessionDate) : null, highlandsPicName: row.highlandsPicName, highlandsPicPhone: row.highlandsPicPhone, viettelSignalHandoverDate: row.viettelSignalHandoverDate ? new Date(row.viettelSignalHandoverDate) : null, ftelContractNumber: row.ftelContractNumber, pppoeUsername: row.pppoeUsername, pppoePasswordEncrypted: row.pppoePassword ? this.encryption.encrypt(row.pppoePassword) : null, onlineDateTime: row.onlineDateTime ? new Date(row.onlineDateTime) : null, configurationCompletedAt: row.configurationCompletedAt ? new Date(row.configurationCompletedAt) : null, outdoorStatus: row.outdoorStatus as InfrastructureStatus, indoorStatus: row.indoorStatus as InfrastructureStatus, infrastructureCompletedDate: row.infrastructureCompletedDate ? new Date(row.infrastructureCompletedDate) : null, surveyContactPhone: row.surveyContactPhone, note: row.note, createdById: userId, updatedById: userId } }); imported++;
      }
      return { imported, skipped, invalid: rows.length - valid.length };
    });
    await this.audit.write({ userId }, 'IMPORT_EXCEL', 'SITE', undefined, { rows: { oldValue: 0, newValue: result.imported } });
    return result;
  }
  async template() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Highlands Internet Deployment';
    const sheet = workbook.addWorksheet('Mau Import');
    const columns: Array<[string, number]> = [
      ['Project Type', 16], ['Status', 18], ['Province', 18], ['MST', 18], ['Store Type', 18], ['Store Name', 32], ['Address', 55],
      ['Site Possession', 18], ['PIC', 20], ['PIC Phone', 16], ['Viettel bàn giao tín hiệu', 22], ['Số hợp đồng FTEL', 20],
      ['PPPoE Username', 22], ['PPPoE Password', 20], ['Thời gian Online', 20], ['Hoàn tất cấu hình', 20], ['Outdoor', 18],
      ['Indoor', 18], ['Ngày hoàn tất triển khai', 24], ['SĐT khảo sát', 16], ['Ghi chú', 35],
    ];
    sheet.columns = columns.map(([header, width]) => ({ header, width }));
    sheet.addRow([
      'NSO / OTHER', 'PENDING / ON_PROGRESS / DONE / CANCELLED', 'Bắt buộc', '10 số hoặc 10 số-3 số', 'Ví dụ: Core Store',
      'Bắt buộc', 'Bắt buộc', 'dd/mm/yyyy', 'Tên PIC Highlands', '0xxxxxxxxx', 'dd/mm/yyyy', 'Không bắt buộc',
      'Không bắt buộc', 'Không bắt buộc', 'dd/mm/yyyy hh:mm', 'dd/mm/yyyy hh:mm',
      'NOT_STARTED / SURVEYING / DEPLOYING / COMPLETED / BLOCKED',
      'NOT_STARTED / SURVEYING / DEPLOYING / COMPLETED / BLOCKED', 'dd/mm/yyyy', '0xxxxxxxxx', 'Không bắt buộc',
    ]);
    sheet.addRow([
      'NSO', 'ON_PROGRESS', 'AN GIANG', '0123456789', 'Core Store', '316 Tran Hung Dao Long Xuyen',
      '316 Trần Hưng Đạo, Phường Long Xuyên, Tỉnh An Giang', new Date('2026-08-01'), 'Nghĩa', '0912345678',
      new Date('2026-08-05'), 'FTEL-2026-001', 'highlands_316', 'MatKhauMau123', new Date('2026-08-10T09:00:00'),
      new Date('2026-08-10T10:30:00'), 'COMPLETED', 'COMPLETED', new Date('2026-08-09'), '0987654321', 'Dòng dữ liệu mẫu - có thể xóa',
    ]);
    const header = sheet.getRow(1);
    header.height = 28;
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEE0033' } };
    header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    const guide = sheet.getRow(2);
    guide.height = 44;
    guide.font = { italic: true, color: { argb: 'FF667085' }, size: 10 };
    guide.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F7' } };
    guide.alignment = { vertical: 'middle', wrapText: true };
    sheet.views = [{ state: 'frozen', ySplit: 2 }];
    sheet.autoFilter = 'A1:U1';
    ['H', 'K', 'O', 'P', 'S'].forEach((column) => { sheet.getColumn(column).numFmt = 'dd/mm/yyyy hh:mm'; });
    for (let row = 3; row <= 500; row++) {
      sheet.getCell(`A${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"NSO,OTHER"'] };
      sheet.getCell(`B${row}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"PENDING,ON_PROGRESS,DONE,CANCELLED"'] };
      for (const column of ['Q', 'R']) sheet.getCell(`${column}${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"NOT_STARTED,SURVEYING,DEPLOYING,COMPLETED,BLOCKED"'] };
    }
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  async export(query: QuerySitesDto, userId: number) {
    const where: Prisma.SiteWhereInput = { deletedAt: null, highlandsStatus: query.status, province: query.province, storeTypeId: query.storeTypeId, onlineDateTime: query.online === undefined ? undefined : query.online ? { not: null } : null };
    const sites = await this.prisma.site.findMany({ where, include: { storeType: true }, orderBy: { storeName: 'asc' } });
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Highlands Sites');
    const columns: Array<[string, string, number]> = [
      ['Project Type','projectType',14],['Status','highlandsStatus',16],['Province','province',18],['MST','taxCode',18],['Store Type','storeType',18],['Store Name','storeName',32],['Address','address',55],['Site Possession','sitePossessionDate',18],['PIC','highlandsPicName',18],['PIC Phone','highlandsPicPhone',16],['Viettel bàn giao tín hiệu','viettelSignalHandoverDate',22],['Số hợp đồng FTEL','ftelContractNumber',20],['PPPoE Username','pppoeUsername',20],['Thời gian Online','onlineDateTime',20],['Hoàn tất cấu hình','configurationCompletedAt',20],['Outdoor','outdoorStatus',18],['Indoor','indoorStatus',18],['Ngày hoàn tất triển khai','infrastructureCompletedDate',22],['SĐT khảo sát','surveyContactPhone',16],['Ghi chú','note',35],
    ];
    sheet.columns = columns.map(([header,key,width]) => ({ header, key, width }));
    for (const site of sites) sheet.addRow({ ...site, storeType: site.storeType?.name ?? '' });
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEE0033' } }; sheet.views = [{ state: 'frozen', ySplit: 1 }]; sheet.autoFilter = 'A1:T1';
    ['H','K','N','O','R'].forEach((col) => { sheet.getColumn(col).numFmt = 'dd/mm/yyyy hh:mm'; });
    await this.audit.write({ userId }, 'EXPORT_EXCEL', 'SITE', undefined, { rows: { oldValue: 0, newValue: sites.length } });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
