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
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-[12px] font-bold uppercase tracking-wide text-slate-700"
        style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
      >
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1.5 rounded-none-none border border-slate-300 bg-slate-50 p-2.5 text-[13px] -xs focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 ">
        {tags.map((tag, idx) => (
          <span
            key={`${tag}-${idx}`}
            className="inline-flex items-center gap-1.5 rounded-none-none bg-slate-100 border border-slate-200/80 px-2.5 py-1 text-[12.5px] font-medium text-slate-800"
            style={{ fontFamily: 'sans-serif' }}
          >
            {tag}
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeTag(idx)}
              aria-label={`Remove ${tag}`}
              className="text-slate-400 hover:text-slate-700 focus:outline-hidden disabled:opacity-50 "
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
          className="min-w-[120px] flex-1 bg-transparent text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50"
          style={{ fontFamily: 'sans-serif' }}
        />
      </div>
    </div>
  );
}
