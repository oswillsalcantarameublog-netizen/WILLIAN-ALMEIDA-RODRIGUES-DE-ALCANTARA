import React, { useState } from 'react';
import {
  CheckCircle2,
  Edit3,
  MessageCircle,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { DEFAULT_CONFIRM_TEMPLATE, SCHEMA_LIMITS, ServiceItem } from '../types';
import { formatBRL } from '../utils/whatsapp';

interface ServicesViewProps {
  services: ServiceItem[];
  loading: boolean;
  onSaveService: (
    data: Omit<ServiceItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>,
    editingId?: string
  ) => Promise<void>;
  onDeleteService: (serviceId: string) => Promise<void>;
  onLoadStarterServices: () => Promise<void>;
}

export const ServicesView: React.FC<ServicesViewProps> = ({
  services,
  loading,
  onSaveService,
  onDeleteService,
  onLoadStarterServices,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Manutenção');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [description, setDescription] = useState('');
  const [autoConfirmMessageEnabled, setAutoConfirmMessageEnabled] = useState(true);
  const [confirmMessageTemplate, setConfirmMessageTemplate] = useState(DEFAULT_CONFIRM_TEMPLATE);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  function resetForm() {
    setEditingId(null);
    setName('');
    setPrice('');
    setCategory('Manutenção');
    setDurationMinutes('60');
    setDescription('');
    setAutoConfirmMessageEnabled(true);
    setConfirmMessageTemplate(DEFAULT_CONFIRM_TEMPLATE);
    setActive(true);
  }

  function startEdit(srv: ServiceItem) {
    setEditingId(srv.id);
    setName(srv.name);
    setPrice(String(srv.price));
    setCategory(srv.category);
    setDurationMinutes(String(srv.durationMinutes));
    setDescription(srv.description || '');
    setAutoConfirmMessageEnabled(srv.autoConfirmMessageEnabled);
    setConfirmMessageTemplate(srv.confirmMessageTemplate || DEFAULT_CONFIRM_TEMPLATE);
    setActive(srv.active);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericPrice = Number(price.replace(',', '.'));
    if (Number.isNaN(numericPrice) || numericPrice < 0) return;

    setSaving(true);
    try {
      await onSaveService(
        {
          name: name.trim().slice(0, SCHEMA_LIMITS.NAME_MAX),
          price: numericPrice,
          category: category.trim().slice(0, SCHEMA_LIMITS.CATEGORY_MAX) || 'Geral',
          durationMinutes: Math.max(5, Math.min(1440, Number(durationMinutes) || 60)),
          description: description.trim().slice(0, SCHEMA_LIMITS.DESCRIPTION_MAX),
          autoConfirmMessageEnabled,
          confirmMessageTemplate:
            confirmMessageTemplate.trim().slice(0, SCHEMA_LIMITS.TEMPLATE_MAX) ||
            DEFAULT_CONFIRM_TEMPLATE,
          active,
        },
        editingId || undefined
      );
      resetForm();
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadStarters() {
    setSeeding(true);
    try {
      await onLoadStarterServices();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Form */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-slate-900">
            {editingId ? 'Editar Serviço' : 'Adicionar Serviço'}
          </h2>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Cancelar edição
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nome do Serviço
            </label>
            <input
              type="text"
              required
              maxLength={SCHEMA_LIMITS.NAME_MAX}
              placeholder="Ex: Instalação de Ar-Condicionado"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Valor (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="150.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Duração (min)
              </label>
              <input
                type="number"
                min="5"
                max="1440"
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Categoria
            </label>
            <input
              type="text"
              required
              maxLength={SCHEMA_LIMITS.CATEGORY_MAX}
              placeholder="Ex: Elétrica, Hidráulica, Consultoria, Estética..."
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Descrição curta (opcional)
            </label>
            <input
              type="text"
              maxLength={SCHEMA_LIMITS.DESCRIPTION_MAX}
              placeholder="O que está incluso neste serviço"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {/* Per-Service "Agendamento Confirmado" Message Option */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={autoConfirmMessageEnabled}
                onChange={(e) => setAutoConfirmMessageEnabled(e.target.checked)}
                className="mt-1 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
              />
              <div>
                <span className="text-sm font-medium text-slate-900 block">
                  Mensagem &ldquo;Agendamento Confirmado&rdquo; ao agendar
                </span>
                <span className="text-xs text-slate-500 block">
                  Ativa automaticamente o envio da confirmação no WhatsApp para este serviço.
                </span>
              </div>
            </label>

            {autoConfirmMessageEnabled && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Texto da Mensagem (variáveis: {'{cliente}'}, {'{servico}'}, {'{valor}'}, {'{data}'}, {'{hora}'}, {'{endereco}'})
                </label>
                <textarea
                  rows={4}
                  maxLength={SCHEMA_LIMITS.TEMPLATE_MAX}
                  value={confirmMessageTemplate}
                  onChange={(e) => setConfirmMessageTemplate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
            />
            <span className="text-sm text-slate-700">Serviço ativo para agendamentos</span>
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {saving
              ? 'Salvando...'
              : editingId
              ? 'Salvar Alterações'
              : 'Adicionar Serviço'}
          </button>
        </form>
      </div>

      {/* List */}
      <div className="lg:col-span-7 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Serviços Cadastrados ({services.length})
            </h2>
            <p className="text-xs text-slate-500">
              Cada serviço aparece como opção de agendamento e separa automaticamente na planilha.
            </p>
          </div>
          {services.length === 0 && !loading && (
            <button
              type="button"
              disabled={seeding}
              onClick={handleLoadStarters}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
              {seeding ? 'Criando...' : 'Carregar Modelos Prontos'}
            </button>
          )}
        </div>

        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <p className="text-sm font-medium text-slate-800">
              Nenhum serviço cadastrado ainda.
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Adicione seus serviços com nome e valor ao lado ou carregue modelos prontos para começar agora.
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {services.map((srv) => (
              <div
                key={srv.id}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{srv.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{srv.durationMinutes} min</span>
                    <span aria-hidden="true">·</span>
                    {srv.active ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Ativo
                      </span>
                    ) : (
                      <span className="text-slate-400">Inativo</span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-3">
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      {srv.name}
                    </h3>
                    <span className="font-mono text-sm font-bold text-emerald-700 tabular-nums">
                      {formatBRL(srv.price)}
                    </span>
                  </div>
                  {srv.description && (
                    <p className="text-xs text-slate-600">{srv.description}</p>
                  )}
                  <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-700" />
                    {srv.autoConfirmMessageEnabled
                      ? 'Mensagem automática "Agendamento Confirmado" ativa'
                      : 'Mensagem de confirmação automática desativada'}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(srv)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteService(srv.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-white hover:bg-red-50 border border-slate-200 rounded-md transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
