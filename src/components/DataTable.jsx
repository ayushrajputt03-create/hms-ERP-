import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, Search } from 'lucide-react'

export default function DataTable({
  columns,
  data,
  searchable = true,
  searchPlaceholder = 'Search...',
  onRowClick,
  emptyMessage = 'No data found.',
}) {
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    return data.filter((row) =>
      columns.some((col) => {
        const val = col.accessor ? row[col.accessor] : col.cell?.(row)
        return String(val ?? '').toLowerCase().includes(q)
      })
    )
  }, [data, search, columns])

  const sorted = useMemo(() => {
    if (!sortCol) return filtered
    return [...filtered].sort((a, b) => {
      const aVal = a[sortCol] ?? ''
      const bVal = b[sortCol] ?? ''
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortCol, sortDir])

  const handleSort = (accessor) => {
    if (!accessor) return
    if (sortCol === accessor) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortCol(accessor)
      setSortDir('asc')
    }
  }

  return (
    <div className="data-table-wrapper">
      {searchable && (
        <div className="data-table-search">
          <Search size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
          />
        </div>
      )}
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.header}
                  onClick={() => handleSort(col.accessor)}
                  style={{ cursor: col.accessor ? 'pointer' : 'default', width: col.width }}
                >
                  <span>{col.header}</span>
                  {sortCol === col.accessor && (
                    sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="empty-row">{emptyMessage}</td>
              </tr>
            ) : (
              sorted.map((row, i) => (
                <tr
                  key={row.id || i}
                  onClick={() => onRowClick?.(row)}
                  className={onRowClick ? 'clickable' : ''}
                >
                  {columns.map((col) => (
                    <td key={col.header}>
                      {col.cell ? col.cell(row) : row[col.accessor] ?? ''}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
