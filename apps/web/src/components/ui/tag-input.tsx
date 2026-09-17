import { useState, KeyboardEvent, ChangeEvent } from 'react';

interface TagInputProps {
  id: string;
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function TagInput({
  id,
  label,
  tags,
  onChange,
  placeholder = 'Type and press Enter...',
  disabled = false,
}: TagInputProps) {
  const [inputVal, setInputVal] = useState('');

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputVal('');
  };

  const removeTag = (indexToRemove: number) => {
    if (disabled) return;
    onChange(tags.filter((_, idx) => idx !== indexToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputVal);
    } else if (e.key === 'Tab') {
      if (inputVal.trim().length > 0) {
        addTag(inputVal);
        // Do not prevent default so browser focus advances naturally
      }
    } else if (e.key === 'Backspace' && inputVal === '' && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val.includes(',')) {
      const parts = val.split(',');
      const lastPart = parts.pop() || '';
      parts.forEach((p) => addTag(p));
      setInputVal(lastPart);
    } else {
      setInputVal(val);
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-xs font-medium text-slate-700">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white p-2 text-xs focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800">
        {tags.map((tag, idx) => (
          <span
            key={`${tag}-${idx}`}
            className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-800"
          >
            {tag}
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeTag(idx)}
              aria-label={`Remove ${tag}`}
              className="text-slate-400 hover:text-slate-600 focus:outline-hidden disabled:opacity-50"
            >
              &times;
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={inputVal}
          disabled={disabled}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(inputVal)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="min-w-[120px] flex-1 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
    </div>
  );
}
