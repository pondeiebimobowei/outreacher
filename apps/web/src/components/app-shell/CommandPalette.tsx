import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { HugeiconsIcon } from '@hugeicons/react';
import { SearchIcon, XIcon, HousePlusIcon, KeyframesMultipleAddIcon, DashboardSquare02Icon, BuildingIcon, Briefcase, UserMultiple02FreeIcons, Megaphone, Mail, MessageSquare, FileText, Settings, AtSign, Zap, User } from '@hugeicons/core-free-icons';
import { IconSvgObject } from '@hugeicons/core-free-icons/types';
;

export interface PaletteCommand {
  id: string;
  label: string;
  group: 'Navigation' | 'Actions';
  icon: IconSvgObject;
  route: string;
  keywords?: string[];
}

export const PALETTE_COMMANDS: PaletteCommand[] = [
  // Actions
  { id: 'action-add-company', label: 'Add company', group: 'Actions', icon: HousePlusIcon, route: '/companies', keywords: ['create', 'new', 'company'] },
  { id: 'action-create-campaign', label: 'Create campaign', group: 'Actions', icon: KeyframesMultipleAddIcon, route: '/campaigns', keywords: ['new', 'outreach', 'campaign'] },

  // Navigation
  { id: 'nav-dashboard', label: 'Go to Dashboard', group: 'Navigation', icon: DashboardSquare02Icon, route: '/', keywords: ['home', 'overview'] },
  { id: 'nav-companies', label: 'Go to Companies', group: 'Navigation', icon: BuildingIcon, route: '/companies', keywords: ['accounts', 'employers'] },
  { id: 'nav-opportunities', label: 'Go to Opportunities', group: 'Navigation', icon: Briefcase, route: '/opportunities', keywords: ['jobs', 'roles', 'leads'] },
  { id: 'nav-contacts', label: 'Go to Contacts', group: 'Navigation', icon: UserMultiple02FreeIcons, route: '/contacts', keywords: ['people', 'leads', 'recipients'] },
  { id: 'nav-campaigns', label: 'Go to Campaigns', group: 'Navigation', icon: Megaphone, route: '/campaigns', keywords: ['outreach', 'sequences'] },
  { id: 'nav-outreaches', label: 'Go to Outreaches', group: 'Navigation', icon: Mail, route: '/outreaches', keywords: ['emails', 'messages', 'drafts'] },
  { id: 'nav-conversations', label: 'Go to Conversations', group: 'Navigation', icon: MessageSquare, route: '/conversations', keywords: ['replies', 'inbox', 'threads'] },
  { id: 'nav-templates', label: 'Go to Templates', group: 'Navigation', icon: FileText, route: '/templates', keywords: ['copy', 'snippets'] },
  { id: 'nav-settings', label: 'Go to Settings', group: 'Navigation', icon: Settings, route: '/settings', keywords: ['preferences', 'account'] },
  { id: 'nav-senders', label: 'Go to Sender Accounts', group: 'Navigation', icon: AtSign, route: '/settings/senders', keywords: ['resend', 'email accounts'] },
  { id: 'nav-integrations', label: 'Go to Integrations', group: 'Navigation', icon: Zap, route: '/settings/integrations', keywords: ['api keys', 'webhooks'] },
  { id: 'nav-career-profile', label: 'Go to Career Profile', group: 'Navigation', icon: User, route: '/settings/career-profile', keywords: ['profile', 'headline', 'skills'] },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  // Focus management
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement;
      setQuery('');
      setActiveIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      triggerRef.current?.focus();
    }
  }, [open]);

  // Filter commands
  const filtered = PALETTE_COMMANDS.filter((cmd) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    if (cmd.label.toLowerCase().includes(q)) return true;
    return cmd.keywords?.some((k) => k.toLowerCase().includes(q));
  });

  // Group filtered commands
  const actions = filtered.filter((c) => c.group === 'Actions');
  const navigation = filtered.filter((c) => c.group === 'Navigation');

  // Flat list for keyboard indexing
  const flatCommands = [...actions, ...navigation];

  const handleSelect = useCallback(
    (cmd: PaletteCommand) => {
      onClose();
      navigate({ to: cmd.route });
    },
    [navigate, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'ArrowDown':
          e.preventDefault();
          setActiveIdx((i) => (i + 1) % Math.max(1, flatCommands.length));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIdx((i) => (i - 1 + Math.max(1, flatCommands.length)) % Math.max(1, flatCommands.length));
          break;
        case 'Enter': {
          e.preventDefault();
          const target = flatCommands[activeIdx];
          if (target) handleSelect(target);
          break;
        }
        case 'Tab':
          // Keep focus inside dialog
          e.preventDefault();
          break;
      }
    },
    [flatCommands, activeIdx, handleSelect, onClose],
  );

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector('[aria-selected="true"]') as HTMLElement | null;
    if (typeof el?.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIdx]);

  // Reset active index on query change
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  let cursor = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs -opacity"
        onClick={onClose}
        aria-hidden="true"
        data-testid="palette-backdrop"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="fixed z-50 flex flex-col overflow-hidden bg-slate-50  border border-border rounded-none-none w-[min(620px,calc(100vw-32px))] max-h-[min(520px,calc(100vh-96px))]"
        style={{
          top: 'clamp(16px, 10vh, 80px)',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border shrink-0">
          <HugeiconsIcon icon={SearchIcon} size={16} className="text-muted-fg shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            aria-controls="palette-listbox"
            aria-activedescendant={flatCommands[activeIdx] ? `palette-cmd-${flatCommands[activeIdx].id}` : undefined}
            aria-label="Search navigation and actions"
            placeholder="Type a command or jump to page..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-[14px] text-(--color-primary) placeholder:text-muted-fg font-body min-w-0"
            spellCheck={false}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-none-none text-muted-fg hover:bg-(--color-muted) hover:text-(--color-primary)  cursor-pointer"
              aria-label="Clear input"
            >
              <HugeiconsIcon icon={XIcon} size={14} />
            </button>
          )}
          <kbd className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded-none bg-(--color-muted) text-muted-fg border border-border font-body">
            esc
          </kbd>
        </div>

        {/* Command list */}
        <div
          id="palette-listbox"
          ref={listRef}
          role="listbox"
          aria-label="Available commands"
          className="overflow-y-auto flex-1 p-2 space-y-4"
        >
          {flatCommands.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="w-10 h-10 rounded-none-none flex items-center justify-center bg-(--color-muted) text-muted-fg mb-3">
                <HugeiconsIcon icon={SearchIcon} size={18} />
              </div>
              <p className="text-[14px] font-semibold text-(--color-primary) font-heading mb-1">
                No commands found
              </p>
              <p className="text-[13px] text-muted-fg font-body">
                No matching actions for "{query}".
              </p>
            </div>
          ) : (
            <>
              {/* Actions Group */}
              {actions.length > 0 && (
                <div role="group" aria-label="Actions">
                  <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-fg font-heading">
                    Actions
                  </div>
                  <div className="space-y-0.5 mt-1">
                    {actions.map((cmd) => {
                      const idx = cursor++;
                      const active = activeIdx === idx;
                      return (
                        <button
                          key={cmd.id}
                          id={`palette-cmd-${cmd.id}`}
                          role="option"
                          aria-selected={active}
                          type="button"
                          onClick={() => handleSelect(cmd)}
                          onMouseEnter={() => setActiveIdx(idx)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-none-none text-left  cursor-pointer min-h-[44px] ${active
                            ? 'bg-(--color-muted) text-(--color-primary)'
                            : 'text-slate-700 hover:bg-(--color-muted)'
                            }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-none-none flex items-center justify-center shrink-0  ${active
                              ? 'bg-slate-50 -xs border border-border text-[var(--color-accent)]'
                              : 'bg-(--color-muted) text-muted-fg'
                              }`}
                          >
                            <HugeiconsIcon icon={cmd.icon} size={14} />
                          </div>
                          <span className="flex-1 text-[13.5px] font-medium font-heading">
                            {cmd.label}
                          </span>
                          <span className="text-[11px] text-muted-fg font-body">
                            Action
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Navigation Group */}
              {navigation.length > 0 && (
                <div role="group" aria-label="Navigation">
                  <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-fg font-heading">
                    Navigation
                  </div>
                  <div className="space-y-0.5 mt-1">
                    {navigation.map((cmd) => {
                      const idx = cursor++;
                      const active = activeIdx === idx;
                      return (
                        <button
                          key={cmd.id}
                          id={`palette-cmd-${cmd.id}`}
                          role="option"
                          aria-selected={active}
                          type="button"
                          onClick={() => handleSelect(cmd)}
                          onMouseEnter={() => setActiveIdx(idx)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-none-none text-left  cursor-pointer min-h-[44px] ${active
                            ? 'bg-(--color-muted) text-(--color-primary)'
                            : 'text-slate-700 hover:bg-(--color-muted)'
                            }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-none-none flex items-center justify-center shrink-0  ${active
                              ? 'bg-slate-50 -xs border border-border text-[var(--color-accent)]'
                              : 'bg-(--color-muted) text-muted-fg'
                              }`}
                          >
                            <HugeiconsIcon icon={cmd.icon} size={14} />
                          </div>
                          <span className="flex-1 text-[13.5px] font-medium font-heading">
                            {cmd.label}
                          </span>
                          <span className="text-[11px] text-muted-fg font-body">
                            Jump to
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className="flex items-center gap-5 px-4 py-2.5 border-t border-border bg-slate-50/70 text-[11px] text-muted-fg font-body select-none">
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded-none bg-slate-50 border border-border text-[10px] -2xs">
              ↑
            </kbd>
            <kbd className="px-1.5 py-0.5 rounded-none bg-slate-50 border border-border text-[10px] -2xs">
              ↓
            </kbd>
            <span>navigate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded-none bg-slate-50 border border-border text-[10px] -2xs">
              ↵
            </kbd>
            <span>select</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded-none bg-slate-50 border border-border text-[10px] -2xs">
              esc
            </kbd>
            <span>close</span>
          </div>
        </div>
      </div>
    </>
  );
}
