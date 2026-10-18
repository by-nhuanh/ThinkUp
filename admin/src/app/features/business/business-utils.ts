export const money = (value: number): string => `${new Intl.NumberFormat('vi-VN').format(value)} ₫`;
export const dateTime = (value: string): string => new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  timeZone: 'Asia/Ho_Chi_Minh'
}).format(new Date(value));

export function matchesDates(value: string, from: string, to: string): boolean {
  const date = value.slice(0, 10);
  return (!from || date >= from) && (!to || date <= to);
}

export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
