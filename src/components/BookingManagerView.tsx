import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Link2,
  MapPin,
  MessageCircle,
  Plus,
  Share2,
} from 'lucide-react';
import { Booking, SCHEMA_LIMITS, ServiceItem } from '../types';
import {
  buildBookingConfirmedMessage,
  buildOwnerNewBookingMessage,
  buildWhatsAppHref,
  formatBRL,
  formatDateBR,
  formatPhoneDisplay,
  getPublicBaseUrl,
  getPublicBookingUrl,
  getStoredPublicBaseUrl,
  setStoredPublicBaseUrl,
} from '../utils/whatsapp';

interface BookingManagerViewProps {
  ownerId: string;
  businessName: string;
  ownerWhatsapp: string;
  services: ServiceItem[];
  onCreateBooking: (input: {
    service: ServiceItem;
    clientName: string;
    clientPhone: string;
    serviceAddress: string;
    scheduledDate: string;
    scheduledTime: string;
    notes: string;
  }) => Promise<Booking>;
  onMarkWhatsAppSent: (bookingId: string, field: 'whatsappConfirmedSent' | 'whatsappOwnerNotified') => Promise<void>;
  onNavigateToServices: () => void;
  onOpenPublicBooking: () => void;
}

export const BookingManagerView: React.FC<BookingManagerViewProps> = ({
  ownerId,
  businessName,
  ownerWhatsapp,
  services,
  onCreateBooking,
  onMarkWhatsAppSent,
  onNavigateToServices,
  onOpenPublicBooking,
}) => {
  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);
  const [serviceId, setServiceId] = useState(activeServices[0]?.id || '');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [serviceAddress, setServiceAddress] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastCreated, setLastCreated] = useState<{
    booking: Booking;
    service: ServiceItem;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [editingBaseUrl, setEditingBaseUrl] = useState(false);
  const [customBaseUrl, setCustomBaseUrl] = useState(() => getStoredPublicBaseUrl() || getPublicBaseUrl());

  const effectiveServiceId =
    activeServices.find((s) => s.id === serviceId)?.id || activeServices[0]?.id || '';
  const selectedService = activeServices.find((s) => s.id === effectiveServiceId) || null;

  const publicUrl = getPublicBookingUrl(ownerId);

  function handleSaveCustomUrl(e: React.FormEvent) {
    e.preventDefault();
    setStoredPublicBaseUrl(customBaseUrl);
    setEditingBaseUrl(false);
  }

  function handleCopyPublicLink() {
    navigator.clipboard?.writeText(publicUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedService) return;
    setSaving(true);
    try {
      const created = await onCreateBooking({
        service: selectedService,
        clientName: clientName.trim().slice(0, SCHEMA_LIMITS.NAME_MAX),
        clientPhone: clientPhone.trim().slice(0, SCHEMA_LIMITS.PHONE_MAX),
        serviceAddress: serviceAddress.trim().slice(0, SCHEMA_LIMITS.ADDRESS_MAX),
        scheduledDate,
        scheduledTime,
        notes: notes.trim().slice(0, SCHEMA_LIMITS.NOTES_MAX),
      });
      setLastCreated({ booking: created, service: selectedService });
      setClientName('');
      setClientPhone('');
      setServiceAddress('');
      setNotes('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Booking Form */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Agendar Novo Serviço
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Todo agendamento salvo entra automaticamente na planilha detalhada por serviço e por data.
          </p>
        </div>

        {activeServices.length === 0 ? (
          <div className="border border-slate-200 rounded-lg p-6 text-center space-y-3">
            <p className="text-sm font-medium text-slate-800">
              Você ainda não cadastrou nenhum serviço ativo.
            </p>
            <p className="text-xs text-slate-500">
              Cadastre primeiro o nome e o valor dos serviços que você oferece para liberar o agendamento.
            </p>
            <button
              type="button"
              onClick={onNavigateToServices}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Cadastrar Serviços
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Serviço
              </label>
              <select
                required
                value={effectiveServiceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {activeServices.map((srv) => (
                  <option key={srv.id} value={srv.id}>
                    {srv.name} — {formatBRL(srv.price)}
                  </option>
                ))}
              </select>
              {selectedService && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>
                    Valor: <strong className="text-slate-900 tabular-nums">{formatBRL(selectedService.price)}</strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Mensagem &ldquo;Agendamento Confirmado&rdquo;:{' '}
                    <strong className={selectedService.autoConfirmMessageEnabled ? 'text-emerald-700' : 'text-slate-600'}>
                      {selectedService.autoConfirmMessageEnabled ? 'Ativa neste serviço' : 'Desativada'}
                    </strong>
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Data do Serviço
                </label>
                <input
                  type="date"
                  required
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Horário
                </label>
                <input
                  type="time"
                  required
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Nome do Cliente
                </label>
                <input
                  type="text"
                  required
                  maxLength={SCHEMA_LIMITS.NAME_MAX}
                  placeholder="Ex: João da Silva"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  WhatsApp do Cliente
                </label>
                <input
                  type="tel"
                  required
                  minLength={8}
                  maxLength={SCHEMA_LIMITS.PHONE_MAX}
                  placeholder="Ex: 47999990000"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  Endereço do Serviço (Salvo automático na planilha)
                </span>
              </label>
              <input
                type="text"
                required
                minLength={3}
                maxLength={SCHEMA_LIMITS.ADDRESS_MAX}
                placeholder="Rua, número, complemento, bairro e cidade"
                value={serviceAddress}
                onChange={(e) => setServiceAddress(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Observações do Serviço (opcional)
              </label>
              <textarea
                rows={2}
                maxLength={SCHEMA_LIMITS.NOTES_MAX}
                placeholder="Detalhes técnicos, ponto de referência, materiais..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 px-5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition-colors min-h-[44px]"
            >
              {saving ? 'Salvando na planilha...' : 'Agendar e Anexar na Planilha'}
            </button>
          </form>
        )}
      </div>

      {/* Right Column: Instant WhatsApp Actions & Public Client Link */}
      <div className="lg:col-span-5 space-y-6">
        {lastCreated && (
          <div className="bg-white border border-emerald-200 rounded-xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  Agendamento adicionado na planilha
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  {lastCreated.booking.clientName} · {lastCreated.booking.serviceName} ({formatDateBR(lastCreated.booking.scheduledDate)} às {lastCreated.booking.scheduledTime})
                </p>
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              {lastCreated.service.autoConfirmMessageEnabled && (
                <a
                  href={buildWhatsAppHref(
                    lastCreated.booking.clientPhone,
                    buildBookingConfirmedMessage(
                      lastCreated.booking,
                      lastCreated.service,
                      businessName
                    )
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => onMarkWhatsAppSent(lastCreated.booking.id, 'whatsappConfirmedSent')}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Enviar &ldquo;Agendamento Confirmado&rdquo; ao Cliente
                </a>
              )}

              <a
                href={buildWhatsAppHref(
                  ownerWhatsapp,
                  buildOwnerNewBookingMessage(lastCreated.booking)
                )}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onMarkWhatsAppSent(lastCreated.booking.id, 'whatsappOwnerNotified')}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Enviar Pedido para Meu WhatsApp ({formatPhoneDisplay(ownerWhatsapp)})
              </a>
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-slate-900">
              <Share2 className="w-4 h-4 text-emerald-700" />
              <h3 className="font-display text-base font-bold">
                Link para o Cliente Agendar Sozinho
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setEditingBaseUrl((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 whitespace-nowrap"
            >
              <Link2 className="w-3.5 h-3.5" />
              {editingBaseUrl ? 'Fechar' : 'Configurar URL'}
            </button>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Envie este link para seus clientes escolherem o serviço, data e digitarem o endereço. Os pedidos entram automaticamente na sua planilha e enviam os dados para seu WhatsApp ({formatPhoneDisplay(ownerWhatsapp)}).
          </p>

          {editingBaseUrl && (
            <form onSubmit={handleSaveCustomUrl} className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <label className="block text-xs font-medium text-slate-700">
                Endereço público do aplicativo (URL compartilhada):
              </label>
              <input
                type="url"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                placeholder="https://ais-pre-..."
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-mono text-slate-800"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800"
                >
                  Salvar URL
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStoredPublicBaseUrl('');
                    setCustomBaseUrl(getPublicBaseUrl());
                    setEditingBaseUrl(false);
                  }}
                  className="px-3 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-md hover:bg-white"
                >
                  Restaurar padrão
                </button>
              </div>
            </form>
          )}

          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700 break-all">
            {publicUrl}
          </div>

          <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 leading-relaxed">
            Para clientes externos acessarem sem erro 403, certifique-se de ativar o compartilhamento público no botão <strong>Share / Compartilhar</strong> no topo do Google AI Studio (opção público / qualquer pessoa com o link).
          </p>

          <div className="flex flex-col sm:flex-row flex-wrap gap-2.5">
            <button
              type="button"
              onClick={handleCopyPublicLink}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedLink ? 'Link Copiado!' : 'Copiar Link'}
            </button>
            <a
              href={buildWhatsAppHref(
                '',
                `Olá! Para agendar seu serviço com *${businessName}*, escolha o serviço, data e informe seu endereço neste link:\n${publicUrl}`
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Enviar Link no WhatsApp
            </a>
            <button
              type="button"
              onClick={onOpenPublicBooking}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Testar / Abrir Portal do Cliente Aqui
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
