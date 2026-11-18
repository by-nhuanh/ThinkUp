import { firstValueFrom, Observable } from 'rxjs';

/** Kích thước trang tối đa backend cho phép khi cần tải toàn bộ danh sách. */
export const API_FETCH_PAGE_SIZE = 100;

export interface ApiPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

/**
 * Tải hết các trang của một endpoint phân trang.
 *
 * Vì sao tải hết: các bảng Admin hiện lọc/sắp xếp phía client và cần KPI trên toàn bộ
 * dữ liệu. Backend đã có phân trang server-side; khi dữ liệu lớn hơn vài nghìn dòng cần
 * chuyển sang query server-side (TODO ghi trong từng adapter).
 */
export async function collectAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<ApiPage<T>>,
  pageSize: number = API_FETCH_PAGE_SIZE,
  maxPages = 40
): Promise<{ items: T[]; total: number }> {
  const first = await fetchPage(1, pageSize);
  const items = [...first.items];
  const pages = Math.min(first.pages || Math.ceil((first.total || items.length) / pageSize), maxPages);

  for (let page = 2; page <= pages; page += 1) {
    const next = await fetchPage(page, pageSize);
    items.push(...next.items);
  }

  return { items, total: first.total ?? items.length };
}

/** Chuyển một Observable phân trang thành Promise theo `ApiPage`. */
export function toApiPage<TItem, TResponse>(
  request: Observable<TResponse>,
  normalize: (response: TResponse) => ApiPage<TItem>
): Promise<ApiPage<TItem>> {
  return firstValueFrom(request).then(normalize);
}
