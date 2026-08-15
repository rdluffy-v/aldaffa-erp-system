import { ChevronUp, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';

/**
 * Table.jsx
 * Sortable, paginated, RTL-aware data table with zebra striping.
 *
 * @param {Object} props
 * @param {Array<{ key: string, label: React.ReactNode, sortable?: boolean,
 *        sortValue?: string, render?: (row, index) => React.ReactNode,
 *        align?: 'start'|'center'|'end', width?: string|number }>} props.columns
 * @param {Array<Object>} props.data - Rows
 * @param {string} [props.keyField='id'] - Unique row key field
 * @param {string} [props.sortKey]  - Currently sorted column key
 * @param {'asc'|'desc'} [props.sortDir] - Sort direction
 * @param {Function} [props.onSort(key, dir)] - Sort handler
 * @param {number} [props.page=1]      - Current page
 * @param {number} [props.pageSize=10] - Rows per page
 * @param {number} [props.total]       - Total rows (defaults to data.length)
 * @param {Function} [props.onPageChange(page)] - Pagination handler
 */
const Table = ({
  columns = [],
  data = [],
  keyField = 'id',
  sortKey,
  sortDir = 'asc',
  onSort,
  page = 1,
  pageSize = 10,
  total,
  onPageChange,
  loading = false,
  emptyMessage = 'لا توجد بيانات',
  loadingMessage = 'جارٍ التحميل...',
  zebra = true,
  hover = true,
  className = '',
  containerClassName = ''
}) => {
  const effectiveTotal = total ?? data.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));

  const handleSort = (column) => {
    if (!column.sortable) return;
    const key = column.sortValue || column.key;
    if (sortKey === key) {
      onSort?.(key, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      onSort?.(key, 'asc');
    }
  };

  const goToPage = (targetPage) => {
    if (targetPage < 1 || targetPage > totalPages) return;
    onPageChange?.(targetPage);
  };

  const cellAlign = (align) => {
    if (align === 'center') return 'text-center';
    if (align === 'end') return 'text-end';
    return 'text-start';
  };

  const pagerButtonClass =
    'p-1.5 rounded-lg text-[#adbac7] hover:text-[#fbbf24] hover:bg-white/5 ' +
    'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[#adbac7] ' +
    'transition-colors duration-150 cursor-pointer';

  return (
    <div className={['glass-card overflow-hidden', containerClassName].join(' ')}>
      <div className="overflow-x-auto scrollbar-luxury">
        <table className={['w-full text-sm border-collapse', className].join(' ')}>
          <thead>
            <tr className="bg-[#0d1117]/60 border-b border-white/5">
              {columns.map((column, index) => {
                const sortColumnKey = column.sortValue || column.key;
                const isSorted = sortKey === sortColumnKey;
                const headerAlign = cellAlign(column.align);

                return (
                  <th
                    key={column.key || index}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    className={`px-4 py-3 font-semibold text-xs whitespace-nowrap ${headerAlign}`}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => handleSort(column)}
                        aria-sort={
                          isSorted
                            ? sortDir === 'asc' ? 'ascending' : 'descending'
                            : undefined
                        }
                        className={[
                          'inline-flex items-center gap-1.5 uppercase tracking-wide',
                          'transition-colors duration-150 cursor-pointer no-select',
                          isSorted ? 'text-[#fbbf24]' : 'text-[#adbac7] hover:text-[#e6edf3]'
                        ].join(' ')}
                      >
                        {column.label}
                        {isSorted ? (
                          sortDir === 'asc' ? (
                            <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          )
                        ) : (
                          <span className="text-[#545d68]" aria-hidden="true">
                            <ChevronUp className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="uppercase tracking-wide text-[#adbac7]">
                        {column.label}
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[#adbac7]">
                  <span className="spinner inline-block align-middle me-2" aria-hidden="true" />
                  {loadingMessage}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-[#768390]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr
                  key={row[keyField] ?? rowIndex}
                  className={[
                    'border-b border-white/[0.04] transition-colors duration-150',
                    zebra && rowIndex % 2 === 1 && 'bg-white/[0.03]',
                    hover && 'hover:bg-white/[0.06]'
                  ].join(' ')}
                >
                  {columns.map((column, index) => (
                    <td
                      key={column.key || index}
                      className={[
                        'px-4 py-3 text-[#adbac7] whitespace-nowrap',
                        cellAlign(column.align)
                      ].join(' ')}
                    >
                      {column.render
                        ? column.render(row, rowIndex)
                        : row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-white/5 bg-[#0d1117]/40">
          <span className="text-xs text-[#768390]">
            الصفحة <span className="text-[#fbbf24] font-semibold">{page}</span> من {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              aria-label="الصفحة السابقة"
              className={pagerButtonClass}
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              aria-label="الصفحة التالية"
              className={pagerButtonClass}
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Table;
