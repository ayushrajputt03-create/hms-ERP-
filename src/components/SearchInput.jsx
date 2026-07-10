import { Search, X } from 'lucide-react'

export default function SearchInput({ value, onChange, placeholder = 'Search...', autoFocus }) {
  return (
    <div className="search-input">
      <Search size={16} />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {value && (
        <button className="btn-icon" onClick={() => onChange('')} aria-label="Clear">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
