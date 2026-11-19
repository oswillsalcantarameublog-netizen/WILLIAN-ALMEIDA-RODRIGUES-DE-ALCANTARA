import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, Save, Trash2 } from 'lucide-react';
import { Booking, BookingStatus, SCHEMA_LIMITS } from '../types';
import { exportBookingsWorkbook } from '../utils/excel';
import {
  formatBRL,
  formatDateBR,
  formatPhoneDisplay,
  getPublicBaseUrl,
  getStoredPublicBaseUrl,
  setStoredPublicBaseUrl,
} from '../utils/whatsapp';

interface HistoryViewProps {
  bookings: Booking[];
  onDeleteBooking: (bookingId: string) => Promise<void>;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ bookings, onDeleteBooking }) => {
  const completedBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.status === BookingStatus.FINALIZADO)
        .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate)),
    [bookings]
  );

  const totalRealized = useMemo(
    () => completedBookings.reduce((sum, b) => sum + b.servicePrice, 0),
    [completedBookings]
  );

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Histórico de Serviços Finalizados
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Estes serviços saíram automaticamente da planilha ativa após serem concluídos.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-slate-500">Total Realizado</p>
            <p className="font-mono text-lg font-bold text-emerald-700 tabular-nums">
              {formatBRL(totalRealized)}
            </p>
          </div>
          <button
            type="button"
            disabled={completedBookings.length === 0}
            onClick={() => exportBookingsWorkbook(completedBookings, 'Historico_Servicos_Concluidos')}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Histórico (.xlsx)
          </button>
        </div>
      </div>

      {completedBookings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
          Nenhum serviço foi finalizado ainda. Assim que um cliente confirmar pelo link ou você concluir um atendimento, ele aparecerá aqui.
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-slate-50">
                  <th className="py-2.5 px-4">Data / Hora</th>
                  <th className="py-2.5 px-4">Serviço</th>
                  <th className="py-2.5 px-4">Cliente</th>
                  <th className="py-2.5 px-4">Endereço</th>
                  <th className="py-2.5 px-4 text-right">Valor</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {completedBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono text-xs tabular-nums whitespace-nowrap">
                      {formatDateBR(b.scheduledDate)} · {b.scheduledTime}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900">{b.serviceName}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="text-slate-900">{b.clientName}</div>
                      <div className="text-xs font-mono text-slate-500">
                        {formatPhoneDisplay(b.clientPhone)}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 max-w-[240px] truncate">
                      {b.serviceAddress}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {formatBRL(b.servicePrice)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Finalizado
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteBooking(b.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                        title="Remover do histórico"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

interface SettingsViewProps {
  ownerId: string;
  businessName: string;
  whatsappNumber: string;
  email: string;
  onSaveSettings: (businessName: string, whatsappNumber: string) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  ownerId,
  businessName,
  whatsappNumber,
  email,
  onSaveSettings,
}) => {
  const [name, setName] = useState(businessName);
  const [phone, setPhone] = useState(whatsappNumber);
  const [publicUrlInput, setPublicUrlInput] = useState(
    () => getStoredPublicBaseUrl() || getPublicBaseUrl()
  );
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) return;
    setSaving(true);
    setSavedOk(false);
    try {
      setStoredPublicBaseUrl(publicUrlInput);
      await onSaveSettings(
        name.trim().slice(0, SCHEMA_LIMITS.NAME_MAX) || 'Minha Empresa',
        digits
      );
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } finally {
      setSaving(false);
    }
  }

  function handleResetPublicUrl() {
    setStoredPublicBaseUrl('');
    setPublicUrlInput(getPublicBaseUrl());
  }

  const previewCleanBase = publicUrlInput.trim().replace(/\/+$/, '') || getPublicBaseUrl();

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Configurações da Empresa, WhatsApp e Domínio Público
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Defina o nome exibido nas mensagens, o WhatsApp que recebe novos pedidos e o domínio público usado nos links compartilhados.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Nome da Empresa ou Profissional
            </label>
            <input
              type="text"
              required
              maxLength={SCHEMA_LIMITS.NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Seu WhatsApp para Receber Pedidos (apenas números com DDD)
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="47997362647"
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-mono text-slate-900 tabular-nums"
            />
            <p className="text-xs text-slate-500 mt-1">
              Padrão configurado: 47997362647 ({formatPhoneDisplay(phone)})
            </p>
          </div>

          {/* Domínio Público / URL de Agendamento Personalizada */}
          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <label className="block text-sm font-medium text-slate-900">
                Domínio Público / URL de Agendamento
              </label>
              <button
                type="button"
                onClick={handleResetPublicUrl}
                className="text-xs font-medium text-slate-500 hover:text-slate-900"
              >
                Restaurar URL padrão
              </button>
            </div>
            <input
              type="url"
              value={publicUrlInput}
              onChange={(e) => setPublicUrlInput(e.target.value)}
              placeholder="https://ais-pre-..."
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-mono text-slate-900"
            />
            <p className="text-xs text-slate-500 leading-relaxed">
              Este endereço é salvo localmente e aplicado automaticamente em todos os links de agendamento e confirmação enviados pelo WhatsApp.
            </p>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
              <p className="text-[11px] font-medium text-slate-500">
                Prévia do Link Público de Agendamento:
              </p>
              <p className="text-xs font-mono text-emerald-800 break-all">
                {`${previewCleanBase}/?agendar=${encodeURIComponent(ownerId)}`}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Conta Conectada
            </label>
            <input
              type="text"
              disabled
              value={email}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </button>
            {savedOk && (
              <span className="text-xs font-medium text-emerald-700">
                Configurações atualizadas!
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
