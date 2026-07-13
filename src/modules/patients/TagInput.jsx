import { useState, useRef } from 'react'
import { X } from 'lucide-react'

export default function TagInput({ tags = [], onChange, placeholder = 'Type and press Enter', variant = 'default' }) {
  const [input, setInput] = useState('')
  const inputRef = useRef(null)

  const addTag = (value) => {
    const trimmed = value.trim()
    if (!trimmed) return
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return
    onChange([...tags, trimmed])
    setInput('')
  }

  const removeTag = (index) => {
    onChange(tags.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags.length - 1)
    }
  }

  const badgeClass = variant === 'danger' ? 'tag-badge tag-badge-danger' : 'tag-badge'

  return (
    <div className="tag-input-wrapper" onClick={() => inputRef.current?.focus()}>
      {tags.map((tag, i) => (
        <span key={i} className={badgeClass}>
          {tag}
          <button type="button" className="tag-remove" onClick={(e) => { e.stopPropagation(); removeTag(i) }}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(input)}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="tag-input-field"
      />
    </div>
  )
}
