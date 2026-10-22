/** File formats exposed by every admin data-export menu. */
export type ExportFormat = 'xlsx' | 'csv';

export interface ExportFormatOption {
  format: ExportFormat;
  label: string;
}

/** Keep all admin list exports limited to spreadsheet-friendly formats. */
export const EXPORT_FORMAT_OPTIONS: ReadonlyArray<ExportFormatOption> = [
  { format: 'xlsx', label: 'Microsoft Excel (.xlsx)' },
  { format: 'csv', label: 'CSV (.csv)' }
];

/** The first row is treated as the table header in both output formats. */
export async function downloadTable(format: ExportFormat, basename: string, rows: (string | number)[][]): Promise<void> {
  if (format === 'csv') {
    downloadCsv(`${basename}.csv`, rows);
    return;
  }
  await downloadXlsx(`${basename}.xlsx`, rows);
}

function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  downloadBlob(filename, csv, 'text/csv;charset=utf-8');
}

async function downloadXlsx(filename: string, rows: (string | number)[][]): Promise<void> {
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet('Dữ liệu');
  worksheet.addRows(rows);
  worksheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(filename, buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', false);
}

function downloadBlob(filename: string, content: BlobPart, type: string, bom = true): void {
  const blob = new Blob(bom ? ['\ufeff', content] : [content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
