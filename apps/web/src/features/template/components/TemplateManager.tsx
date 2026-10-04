import React, { useState, useEffect, useCallback } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { PlusIcon, EyeIcon, Edit01Icon, ArchiveIcon } from '@hugeicons/core-free-icons';
import {
  fetchTemplates,
  fetchTemplateById,
  updateTemplate,
  type EmailTemplateSummaryDto,
  type EmailTemplateDto,
} from '../../../api/templates';
import { TemplateEditorModal } from './TemplateEditorModal';
import { TemplatePreviewDrawer } from './TemplatePreviewDrawer';

export function TemplateManager() {
  const [templates, setTemplates] = useState<EmailTemplateSummaryDto[]>([]);
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal / Drawer state
  const [isEditorOpen, setIsEditorOpen] = useState<boolean>(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplateDto | null>(null);

  const loadTemplates = useCallback(async (withArchived: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchTemplates({ includeArchived: withArchived });
      setTemplates(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load templates';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates(includeArchived);
  }, [includeArchived, loadTemplates]);

  const handleToggleArchived = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIncludeArchived(e.target.checked);
  };

  const handleOpenNew = () => {
    setEditingTemplateId(null);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (id: string) => {
    setEditingTemplateId(id);
    setIsEditorOpen(true);
  };

  const handleOpenPreview = async (id: string) => {
    try {
      const data = await fetchTemplateById(id);
      setPreviewTemplate(data);
      setIsPreviewOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load template for preview';
      setError(msg);
    }
  };

  const handleToggleArchiveTemplate = async (template: EmailTemplateSummaryDto) => {
    try {
      await updateTemplate(template.id, { isArchived: !template.isArchived });
      await loadTemplates(includeArchived);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update template archive status';
      setError(msg);
    }
  };

  return (
    <div className="space-y-6" style={{ fontFamily: '"Plus Jakarta Sans", sans-serif' }}>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Email templates</h1>
          <p className="text-xs text-slate-500 mt-1 font-normal">
            Create reusable outreach messages and ordered follow-up sequences across your workspace
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={handleToggleArchived}
              aria-label="Show archived"
              className="rounded-none border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            Show archived
          </label>
          <button
            type="button"
            onClick={handleOpenNew}
            aria-label="New template"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-none shadow-xs"
          >
            <HugeiconsIcon icon={PlusIcon} size={15} /> New template
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium rounded-none">
          {error}
        </div>
      )}

      {/* Templates Table */}
      <div className="bg-white border border-slate-200 rounded-none overflow-hidden shadow-xs">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-500 font-medium">
            Loading templates...
          </div>
        ) : templates.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700">No templates found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto font-normal">
              {includeArchived
                ? 'No active or archived templates exist in this workspace.'
                : 'Get started by creating your first sequence template.'}
            </p>
            <button
              type="button"
              onClick={handleOpenNew}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-900 border border-slate-300 hover:bg-slate-50 rounded-none"
            >
              <HugeiconsIcon icon={PlusIcon} size={14} /> Create template
            </button>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3 px-4">Template Name</th>
                <th className="py-3 px-4">Steps</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Updated</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
              {templates.map((tmpl) => (
                <tr key={tmpl.id} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {tmpl.name}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-600">
                    {tmpl.stepCount} {tmpl.stepCount === 1 ? 'step' : 'steps'}
                  </td>
                  <td className="py-3 px-4">
                    {tmpl.isArchived ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200 rounded-none">
                        Archived
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-none">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                    {new Date(tmpl.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(tmpl.id)}
                        aria-label={`Preview ${tmpl.name}`}
                        className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-none inline-flex items-center gap-1 font-semibold text-xs"
                      >
                        <HugeiconsIcon icon={EyeIcon} size={14} /> Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(tmpl.id)}
                        aria-label={`Edit ${tmpl.name}`}
                        className="p-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-none inline-flex items-center gap-1 font-semibold text-xs"
                      >
                        <HugeiconsIcon icon={Edit01Icon} size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleArchiveTemplate(tmpl)}
                        aria-label={tmpl.isArchived ? `Unarchive ${tmpl.name}` : `Archive ${tmpl.name}`}
                        className={`p-1 rounded-none inline-flex items-center gap-1 font-semibold text-xs ${
                          tmpl.isArchived
                            ? 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                            : 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
                        }`}
                      >
                        <HugeiconsIcon icon={ArchiveIcon} size={14} />
                        {tmpl.isArchived ? 'Unarchive' : 'Archive'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Editor Modal */}
      <TemplateEditorModal
        isOpen={isEditorOpen}
        onClose={() => {
          setIsEditorOpen(false);
          setEditingTemplateId(null);
        }}
        templateId={editingTemplateId}
        onSaveSuccess={() => void loadTemplates(includeArchived)}
      />

      {/* Preview Drawer */}
      <TemplatePreviewDrawer
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewTemplate(null);
        }}
        template={previewTemplate}
      />
    </div>
  );
}
