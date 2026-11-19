import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Copy,
  Download,
  Filter,
  MessageCircle,
  Play,
  Plus,
  Search,
  Send,
  X,
} from 'lucide-react';
import { Booking, BookingStatus, ServiceItem } from '../types';
import { exportBookingsWorkbook } from '../utils/excel';
import {
  buildBookingConfirmedMessage,
  buildCompletionQuestionMessage,
  buildSpreadsheetWhatsAppMessage,
  buildWhatsAppHref,
  formatBRL,
  formatDateBR,
  formatPhoneDisplay,
} from '../utils/whatsapp';

interface SpreadsheetViewProps {
  bookings: Booking[];
  services: ServiceItem[];
  loading: boolean;
  businessName: string;
  ownerWhatsapp: string;
  onStartService: (booking: Booking) => Promise<void>;
  onCompleteService: (booking: Booking) => Promise<void>;
  onNavigateToBooking: () => void;
}

type GroupMode = 'geral' | 'servico' | 'data';

export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({
  bookings,
  services,
  loading,
  businessName,
  ownerWhatsapp,
  onStartService,
  onCompleteService,
  onNavigateToBooking,
}) => {
  const [groupMode, setGroupMode] = useState<GroupMode>('geral');
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState('todos');
  const [dateFilter, setDateFilter] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  // WhatsApp Spreadsheet Drawer
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTargetPhone, setShareTargetPhone] = useState('');
  const [shareFormat, setShareFormat] = useState<GroupMode>('servico');
  const [copiedMsg, setCopiedMsg] = useState(false);

  const activeBookings = useMemo(
    () =>
      bookings
        .filter(
          (b) =>
            b.status === BookingStatus.AGENDADO ||
            b.status === BookingStatus.EM_ANDAMENTO
        )
        .sort(
          (a, b) =>
            a.scheduledDate.localeCompare(b.scheduledDate) ||
            a.scheduledTime.localeCompare(b.scheduledTime)
        ),
    [bookings]
  );

  const finalizedCount = useMemo(
    () => bookings.filter((b) => b.status === BookingStatus.FINALIZADO).length,
    [bookings]
  );

  const activeTotalValue = useMemo(
    () => activeBookings.reduce((sum, b) => sum + (b.servicePrice || 0), 0),
    [activeBookings]
  );

  const currentInProgress = useMemo(
    () => activeBookings.find((b) => b.status === BookingStatus.EM_ANDAMENTO) || null,
    [activeBookings]
  );

  const filteredBookings = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return activeBookings.filter((b) => {
      if (serviceFilter !== 'todos' && b.serviceName !== serviceFilter) return false;
      if (dateFilter && b.scheduledDate !== dateFilter) return false;
      if (!q) return true;
      return (
        b.clientName.toLowerCase().includes(q) ||
        b.serviceName.toLowerCase().includes(q) ||
        b.serviceAddress.toLowerCase().includes(q) ||
        b.clientPhone.toLowerCase().includes(q)
      );
    });
  }, [activeBookings, searchTerm, serviceFilter, dateFilter]);

  const uniqueServiceNames = useMemo(() => {
    const set = new Set<string>();
    activeBookings.forEach((b) => set.add(b.serviceName));
    return Array.from(set).sort();
  }, [activeBookings]);

  const groupedSections = useMemo(() => {
    if (groupMode === 'geral') {
      return [{ key: 'geral', title: 'Todos os Agendamentos Ativos', items: filteredBookings }];
    }
    const map = new Map<string, Booking[]>();
    filteredBookings.forEach((b) => {
      const k = groupMode === 'servico' ? b.serviceName : b.scheduledDate;
      const arr = map.get(k) || [];
      arr.push(b);
      map.set(k, arr);
    });
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      title: groupMode === 'data' ? formatDateBR(key) : key,
      items,
    }));
  }, [filteredBookings, groupMode]);

  const serviceLookup = useMemo(() => {
    const m = new Map<string, ServiceItem>();
    services.forEach((s) => m.set(s.id, s));
    return m;
  }, [services]);

  const shareMessage = useMemo(
    () => buildSpreadsheetWhatsAppMessage(filteredBookings, shareFormat, businessName),
    [filteredBookings, shareFormat, businessName]
  );

  async function handleStart(booking: Booking) {
    setBusyId(booking.id);
    try {
      await onStartService(booking);
    } finally {
      setBusyId(null);
    }
  }

  async function handleComplete(booking: Booking) {
    setBusyId(booking.id);
    try {
      await onCompleteService(booking);
    } finally {
      setBusyId(null);
    }
  }

  function handleCopyShareMessage() {
    navigator.clipboard?.writeText(shareMessage);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* 4-column Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500 mb-1">Na Planilha Ativa</p>
          <p className="font-display text-2xl font-bold text-slate-900 tabular-nums">
            {activeBookings.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">Pendentes e em atendimento</p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500 mb-1">Valor na Planilha</p>
          <p className="font-display text-2xl font-bold text-emerald-700 tabular-nums">
            {formatBRL(activeTotalValue)}
          </p>
          <p className="text-xs text-slate-500 mt-1">Total dos serviços ativos</p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500 mb-1">Em Atendimento Agora</p>
          <p className="font-display text-lg font-semibold text-slate-900 truncate">
            {currentInProgress ? currentInProgress.clientName : 'Nenhum ativo'}
          </p>
          <p className="text-xs text-slate-500 mt-1 truncate">
            {currentInProgress ? currentInProgress.serviceName : 'Inicie um serviço na tabela'}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500 mb-1">Concluídos (Saíram)</p>
          <p className="font-display text-2xl font-bold text-slate-900 tabular-nums">
            {finalizedCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">Movidos para o histórico</p>
        </div>
      </div>

      {/* Controls & Separation Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Interactive Segmented Control */}
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
            <button
              type="button"
              onClick={() => setGroupMode('geral')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                groupMode === 'geral'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Planilha Geral
            </button>
            <button
              type="button"
              onClick={() => setGroupMode('servico')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                groupMode === 'servico'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Separar por Serviço
            </button>
            <button
              type="button"
              onClick={() => setGroupMode('data')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                groupMode === 'data'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Separar por Data
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => exportBookingsWorkbook(filteredBookings)}
              disabled={filteredBookings.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => {
                setShareTargetPhone(ownerWhatsapp);
                setShareFormat(groupMode);
                setShowShareModal(true);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Enviar Planilha no WhatsApp
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100">
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cliente, serviço, endereço ou telefone..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600"
            />
          </div>
          <div className="md:col-span-4 relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600"
            >
              <option value="todos">Todos os Serviços</option>
              {uniqueServiceNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3 flex items-center gap-2">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 tabular-nums focus:outline-none focus:bg-white focus:ring-2 focus:ring-emerald-600"
            />
            {(searchTerm || serviceFilter !== 'todos' || dateFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setServiceFilter('todos');
                  setDateFilter('');
                }}
                className="px-2.5 py-2 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg whitespace-nowrap"
              >
                Limpar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Spreadsheet Tables */}
      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="h-11 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      ) : filteredBookings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h3 className="font-display text-lg font-semibold text-slate-900 mb-1">
            Planilha ativa sem agendamentos no momento
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            Todo novo serviço agendado entra automaticamente aqui, e os serviços finalizados saem automaticamente para o histórico.
          </p>
          <button
            type="button"
            onClick={onNavigateToBooking}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Agendar Primeiro Serviço
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedSections.map((section) => {
            const sectionTotal = section.items.reduce((acc, item) => acc + item.servicePrice, 0);
            return (
              <div
                key={section.key}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden"
              >
                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-sm">
                    <h3 className="font-display font-semibold text-slate-900">
                      {section.title}
                    </h3>
                    <span className="text-slate-400" aria-hidden="true">
                      ·
                    </span>
                    <span className="text-xs text-slate-600 tabular-nums">
                      {section.items.length} {section.items.length === 1 ? 'serviço' : 'serviços'}
                    </span>
                  </div>
                  <div className="text-sm font-mono font-semibold text-emerald-700 tabular-nums">
                    Subtotal: {formatBRL(sectionTotal)}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-medium text-slate-500 bg-white">
                        <th className="py-2.5 px-4 whitespace-nowrap">Data / Hora</th>
                        <th className="py-2.5 px-4 whitespace-nowrap">Serviço</th>
                        <th className="py-2.5 px-4 whitespace-nowrap">Cliente</th>
                        <th className="py-2.5 px-4 whitespace-nowrap">Endereço do Serviço</th>
                        <th className="py-2.5 px-4 whitespace-nowrap text-right">Valor</th>
                        <th className="py-2.5 px-4 whitespace-nowrap">Status</th>
                        <th className="py-2.5 px-4 whitespace-nowrap text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {section.items.map((item) => {
                        const srv = serviceLookup.get(item.serviceId);
                        const isInProgress = item.status === BookingStatus.EM_ANDAMENTO;
                        const confirmHref = buildWhatsAppHref(
                          item.clientPhone,
                          buildBookingConfirmedMessage(item, srv, businessName)
                        );
                        const finishAskHref = buildWhatsAppHref(
                          item.clientPhone,
                          buildCompletionQuestionMessage(item, businessName)
                        );

                        return (
                          <tr
                            key={item.id}
                            className={`hover:bg-slate-50 transition-colors ${
                              isInProgress ? 'bg-amber-50/40' : ''
                            }`}
                          >
                            <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-slate-700 tabular-nums">
                              <div className="font-semibold text-slate-900">
                                {formatDateBR(item.scheduledDate)}
                              </div>
                              <div className="text-slate-500">{item.scheduledTime}</div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900">{item.serviceName}</div>
                              {item.notes && (
                                <div className="text-xs text-slate-500 truncate max-w-[180px]">
                                  {item.notes}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <div className="font-medium text-slate-900">{item.clientName}</div>
                              <div className="text-xs font-mono text-slate-500 tabular-nums">
                                {formatPhoneDisplay(item.clientPhone)}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div
                                className="text-xs text-slate-700 max-w-[240px] truncate"
                                title={item.serviceAddress}
                              >
                                {item.serviceAddress}
                              </div>
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap text-right font-mono font-semibold text-slate-900 tabular-nums">
                              {formatBRL(item.servicePrice)}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              {isInProgress ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                                  <Play className="w-3.5 h-3.5" />
                                  Em atendimento
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                  <Calendar className="w-3.5 h-3.5" />
                                  Agendado
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap text-right">
                              <div className="inline-flex items-center gap-1.5">
                                {!isInProgress && (
                                  <button
                                    type="button"
                                    disabled={busyId === item.id}
                                    onClick={() => handleStart(item)}
                                    title="Iniciar atendimento deste cliente"
                                    className="px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors whitespace-nowrap"
                                  >
                                    Iniciar
                                  </button>
                                )}
                                <a
                                  href={isInProgress ? finishAskHref : confirmHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={
                                    isInProgress
                                      ? 'Perguntar no WhatsApp se foi finalizado (com link)'
                                      : 'Enviar mensagem Agendamento Confirmado no WhatsApp'
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors whitespace-nowrap"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                  {isInProgress ? 'Link Finalizar' : 'Confirmar'}
                                </a>
                                <button
                                  type="button"
                                  disabled={busyId === item.id}
                                  onClick={() => handleComplete(item)}
                                  title="Finalizar serviço e retirar da planilha ativa"
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md transition-colors whitespace-nowrap"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                  Concluir
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* WhatsApp Spreadsheet Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Enviar Planilha para WhatsApp
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Organize a planilha e envie automaticamente para um cliente ou para seu WhatsApp.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowShareModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 rounded-lg"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Organização na Mensagem
                </label>
                <select
                  value={shareFormat}
                  onChange={(e) => setShareFormat(e.target.value as GroupMode)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900"
                >
                  <option value="servico">Separada por Serviço</option>
                  <option value="data">Separada por Data</option>
                  <option value="geral">Lista Cronológica Geral</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  WhatsApp Destinatário
                </label>
                <input
                  type="tel"
                  value={shareTargetPhone}
                  onChange={(e) => setShareTargetPhone(e.target.value)}
                  placeholder="Ex: 47997362647"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 tabular-nums"
                />
              </div>
            </div>

            {activeBookings.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1.5">
                  Preencher rápido com telefone de um cliente:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShareTargetPhone(ownerWhatsapp)}
                    className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md"
                  >
                    Meu WhatsApp ({formatPhoneDisplay(ownerWhatsapp)})
                  </button>
                  {activeBookings.slice(0, 5).map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setShareTargetPhone(b.clientPhone)}
                      className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md"
                    >
                      {b.clientName}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-700">
                  Pré-visualização da Planilha Formatada
                </label>
                <button
                  type="button"
                  onClick={handleCopyShareMessage}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedMsg ? 'Copiado!' : 'Copiar texto'}
                </button>
              </div>
              <pre className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 whitespace-pre-wrap max-h-56 overflow-y-auto">
                {shareMessage}
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
              <a
                href={buildWhatsAppHref(shareTargetPhone, shareMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Send className="w-4 h-4" />
                Abrir WhatsApp com Planilha
              </a>
              <button
                type="button"
                onClick={() => exportBookingsWorkbook(filteredBookings)}
                className="inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Baixar .xlsx
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
