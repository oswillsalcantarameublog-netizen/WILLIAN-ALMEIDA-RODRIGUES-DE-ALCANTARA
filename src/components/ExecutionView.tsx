import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  MapPin,
  MessageCircle,
  Play,
  User,
} from 'lucide-react';
import { Booking, BookingStatus } from '../types';
import {
  buildCompletionQuestionMessage,
  buildWhatsAppHref,
  formatBRL,
  formatDateBR,
  formatPhoneDisplay,
  getConfirmationUrl,
} from '../utils/whatsapp';

interface ExecutionViewProps {
  bookings: Booking[];
  businessName: string;
  onStartService: (booking: Booking) => Promise<void>;
  onCompleteService: (booking: Booking) => Promise<void>;
  onPreviewClientConfirmation: (bookingId: string, confirmToken: string) => void;
}

export const ExecutionView: React.FC<ExecutionViewProps> = ({
  bookings,
  businessName,
  onStartService,
  onCompleteService,
  onPreviewClientConfirmation,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const inProgressList = useMemo(
    () => bookings.filter((b) => b.status === BookingStatus.EM_ANDAMENTO),
    [bookings]
  );

  const scheduledQueue = useMemo(
    () =>
      bookings
        .filter((b) => b.status === BookingStatus.AGENDADO)
        .sort(
          (a, b) =>
            a.scheduledDate.localeCompare(b.scheduledDate) ||
            a.scheduledTime.localeCompare(b.scheduledTime)
        ),
    [bookings]
  );

  function copyText(text: string, key: string) {
    navigator.clipboard?.writeText(text);
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleStart(b: Booking) {
    setBusyId(b.id);
    try {
      await onStartService(b);
    } finally {
      setBusyId(null);
    }
  }

  async function handleComplete(b: Booking) {
    setBusyId(b.id);
    try {
      await onCompleteService(b);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Active Execution Section */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Cliente em Atendimento Agora
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Acompanhe exatamente qual cliente você está atendendo e envie o link de confirmação de finalização no WhatsApp.
          </p>
        </div>

        {inProgressList.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <User className="w-9 h-9 text-slate-400 mx-auto mb-2.5" />
            <h3 className="font-display text-base font-semibold text-slate-900 mb-1">
              Nenhum atendimento em andamento
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Selecione um dos próximos agendamentos abaixo e clique em &ldquo;Iniciar Atendimento&rdquo; para exibir os dados do cliente aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {inProgressList.map((current) => {
              const confirmUrl = getConfirmationUrl(current.id, current.confirmToken);
              const finishMsg = buildCompletionQuestionMessage(current, businessName);
              const whatsappFinishHref = buildWhatsAppHref(current.clientPhone, finishMsg);
              const mapsHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                current.serviceAddress
              )}`;

              return (
                <div
                  key={current.id}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b border-slate-200">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 mb-1.5">
                        <Play className="w-3.5 h-3.5" />
                        <span>Atendimento em Execução</span>
                        <span className="text-slate-300" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-slate-600 font-normal tabular-nums">
                          {formatDateBR(current.scheduledDate)} às {current.scheduledTime}
                        </span>
                      </div>
                      <h3 className="font-display text-2xl font-bold text-slate-900">
                        {current.clientName}
                      </h3>
                      <p className="text-sm text-slate-600 mt-1">
                        Serviço: <strong className="text-slate-900">{current.serviceName}</strong> ·{' '}
                        <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                          {formatBRL(current.servicePrice)}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        disabled={busyId === current.id}
                        onClick={() => handleComplete(current)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Finalizar e Remover da Planilha
                      </button>
                    </div>
                  </div>

                  {/* Client Contact & Address */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-500">Endereço do Serviço</p>
                      <p className="text-sm font-medium text-slate-900 flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <span>{current.serviceAddress}</span>
                      </p>
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => copyText(current.serviceAddress, `addr-${current.id}`)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copiedId === `addr-${current.id}` ? 'Endereço copiado!' : 'Copiar endereço'}
                        </button>
                        <a
                          href={mapsHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Abrir no Maps
                        </a>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-500">WhatsApp do Cliente</p>
                      <p className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                        {formatPhoneDisplay(current.clientPhone)}
                      </p>
                      {current.notes && (
                        <p className="text-xs text-slate-600">Obs.: {current.notes}</p>
                      )}
                    </div>
                  </div>

                  {/* Completion Confirmation Link Dispatch */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-4">
                    <div>
                      <h4 className="font-display text-sm font-semibold text-slate-900">
                        Perguntar ao Cliente se o Serviço foi Finalizado
                      </h4>
                      <p className="text-xs text-slate-600 mt-1">
                        Envie uma mensagem no WhatsApp com o link exclusivo para o cliente abrir o aplicativo e confirmar a finalização. Assim que ele confirmar, o registro sai automaticamente da planilha ativa.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row flex-wrap gap-2.5">
                      <a
                        href={whatsappFinishHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Enviar Pergunta com Link no WhatsApp
                      </a>
                      <button
                        type="button"
                        onClick={() => copyText(confirmUrl, `link-${current.id}`)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Copy className="w-4 h-4" />
                        {copiedId === `link-${current.id}` ? 'Link Copiado!' : 'Copiar Link de Confirmação'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onPreviewClientConfirmation(current.id, current.confirmToken)}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Abrir Tela do Cliente
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Scheduled Queue */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-slate-900">
            Próximos Agendamentos ({scheduledQueue.length})
          </h3>
        </div>

        {scheduledQueue.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-500">
            Não há agendamentos aguardando início no momento.
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {scheduledQueue.map((item) => (
              <div
                key={item.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                    <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDateBR(item.scheduledDate)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {item.scheduledTime}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono font-semibold text-emerald-700">
                      {formatBRL(item.servicePrice)}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900">
                    {item.clientName} — {item.serviceName}
                  </p>
                  <p className="text-xs text-slate-600 truncate">{item.serviceAddress}</p>
                </div>

                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => handleStart(item)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <Play className="w-3.5 h-3.5" />
                  Iniciar Atendimento
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
