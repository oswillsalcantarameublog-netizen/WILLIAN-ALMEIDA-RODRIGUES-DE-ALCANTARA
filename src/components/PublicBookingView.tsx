import React, { useEffect, useState } from 'react';
import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { AlertCircle, ArrowLeft, Calendar, CheckCircle2, FileSpreadsheet, MapPin, MessageCircle } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { DEFAULT_OWNER_WHATSAPP, PublicProfile, SCHEMA_LIMITS, ServiceItem } from '../types';
import {
  buildBookingConfirmedMessage,
  buildOwnerNewBookingMessage,
  buildWhatsAppHref,
  formatBRL,
} from '../utils/whatsapp';

interface PublicBookingViewProps {
  ownerId: string;
  onBackToApp: () => void;
}

export const PublicBookingView: React.FC<PublicBookingViewProps> = ({
  ownerId,
  onBackToApp,
}) => {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [verifiedBusinessName, setVerifiedBusinessName] = useState<string>('');
  const [invalidOwner, setInvalidOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [serviceAddress, setServiceAddress] = useState('');
  const [scheduledDate, setScheduledDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [scheduledTime, setScheduledTime] = useState('09:00');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedData, setSubmittedData] = useState<{
    service: ServiceItem;
    clientName: string;
    clientPhone: string;
    serviceAddress: string;
    scheduledDate: string;
    scheduledTime: string;
    notes: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadOwnerAndServices() {
      setLoading(true);
      setErrorMsg(null);
      setInvalidOwner(false);

      const cleanOwnerId = (ownerId || '').trim();
      if (!cleanOwnerId || !/^[a-zA-Z0-9_\-]{1,128}$/.test(cleanOwnerId)) {
        if (active) {
          setInvalidOwner(true);
          setLoading(false);
        }
        return;
      }

      try {
        // Verify ownerId against an existing public user profile document before loading the form
        const ownerSnap = await getDoc(doc(db, 'publicProfiles', cleanOwnerId));
        if (!active) return;

        if (!ownerSnap.exists()) {
          setInvalidOwner(true);
          setLoading(false);
          return;
        }

        const ownerProfile = ownerSnap.data() as PublicProfile;
        if (!ownerProfile.active) {
          setInvalidOwner(true);
          setLoading(false);
          return;
        }

        setVerifiedBusinessName(ownerProfile.businessName || 'Prestador de Serviços');

        const q = query(
          collection(db, 'services'),
          where('ownerId', '==', cleanOwnerId),
          where('active', '==', true)
        );
        const snap = await getDocs(q);
        if (!active) return;
        const list: ServiceItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ServiceItem, 'id'>),
        }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setServices(list);
        if (list.length > 0) setSelectedServiceId(list[0].id);
      } catch (err) {
        if (!active) return;
        console.error(err);
        setErrorMsg('Não foi possível validar o link ou carregar os serviços. Tente novamente em instantes.');
      } finally {
        if (active) setLoading(false);
      }
    }
    loadOwnerAndServices();
    return () => {
      active = false;
    };
  }, [ownerId]);

  const selectedService = services.find((s) => s.id === selectedServiceId) || null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedService || invalidOwner) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const cleanName = clientName.trim().slice(0, SCHEMA_LIMITS.NAME_MAX);
      const cleanPhone = clientPhone.trim().slice(0, SCHEMA_LIMITS.PHONE_MAX);
      const cleanAddress = serviceAddress.trim().slice(0, SCHEMA_LIMITS.ADDRESS_MAX);
      const cleanNotes = notes.trim().slice(0, SCHEMA_LIMITS.NOTES_MAX);

      await addDoc(collection(db, 'bookingRequests'), {
        ownerId,
        serviceId: selectedService.id,
        serviceName: selectedService.name.slice(0, SCHEMA_LIMITS.NAME_MAX),
        servicePrice: Number(selectedService.price),
        clientName: cleanName,
        clientPhone: cleanPhone,
        serviceAddress: cleanAddress,
        scheduledDate,
        scheduledTime,
        notes: cleanNotes,
        processed: false,
        createdAt: serverTimestamp(),
      });

      setSubmittedData({
        service: selectedService,
        clientName: cleanName,
        clientPhone: cleanPhone,
        serviceAddress: cleanAddress,
        scheduledDate,
        scheduledTime,
        notes: cleanNotes,
      });
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao enviar o agendamento. Verifique sua conexão e tente novamente.');
      handleFirestoreError(err, OperationType.CREATE, 'bookingRequests');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-6">
      <header className="max-w-2xl w-full mx-auto flex items-center justify-between py-3">
        <div className="flex items-center gap-2.5 text-slate-900">
          <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
          <span className="font-display font-bold text-lg tracking-tight">PlanilhaFlow</span>
        </div>
        <button
          type="button"
          onClick={onBackToApp}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Área do Profissional
        </button>
      </header>

      <main className="max-w-2xl w-full mx-auto my-auto py-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          {loading ? (
            <div className="space-y-4">
              <div className="h-7 bg-slate-100 rounded w-1/2 animate-pulse" />
              <div className="h-12 bg-slate-100 rounded animate-pulse" />
              <div className="h-12 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : invalidOwner ? (
            <div className="text-center py-8 space-y-3">
              <AlertCircle className="w-10 h-10 text-amber-600 mx-auto" />
              <h1 className="font-display text-xl font-semibold text-slate-900">
                Link de agendamento inválido ou inativo
              </h1>
              <p className="text-sm text-slate-600 max-w-md mx-auto">
                Não encontramos nenhum profissional ou empresa cadastrada com este código de link. Solicite um novo link diretamente ao prestador do serviço.
              </p>
              <button
                type="button"
                onClick={onBackToApp}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800"
              >
                Voltar para o início
              </button>
            </div>
          ) : errorMsg ? (
            <div className="text-center py-8 space-y-3">
              <Calendar className="w-10 h-10 text-red-500 mx-auto" />
              <h1 className="font-display text-xl font-semibold text-slate-900">
                Não foi possível abrir os serviços
              </h1>
              <p className="text-sm text-slate-600">{errorMsg}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800"
              >
                Tentar novamente
              </button>
            </div>
          ) : submittedData ? (
            <div className="space-y-6">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">
                    Agendamento solicitado com sucesso
                  </h1>
                  <p className="text-sm text-slate-600 mt-1">
                    Seus dados foram salvos automaticamente na planilha de atendimento de {verifiedBusinessName}.
                  </p>
                </div>
              </div>

              {submittedData.service.autoConfirmMessageEnabled && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-emerald-900 mb-2">
                    Mensagem de Agendamento Confirmado
                  </p>
                  <p className="text-sm text-emerald-950 whitespace-pre-line leading-relaxed">
                    {buildBookingConfirmedMessage(
                      {
                        clientName: submittedData.clientName,
                        serviceName: submittedData.service.name,
                        servicePrice: submittedData.service.price,
                        scheduledDate: submittedData.scheduledDate,
                        scheduledTime: submittedData.scheduledTime,
                        serviceAddress: submittedData.serviceAddress,
                      },
                      submittedData.service,
                      verifiedBusinessName
                    )}
                  </p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <a
                  href={buildWhatsAppHref(
                    DEFAULT_OWNER_WHATSAPP,
                    buildOwnerNewBookingMessage({
                      clientName: submittedData.clientName,
                      clientPhone: submittedData.clientPhone,
                      serviceName: submittedData.service.name,
                      servicePrice: submittedData.service.price,
                      scheduledDate: submittedData.scheduledDate,
                      scheduledTime: submittedData.scheduledTime,
                      serviceAddress: submittedData.serviceAddress,
                      notes: submittedData.notes,
                    })
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Enviar pedido no WhatsApp (47 99736-2647)
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedData(null);
                    setClientName('');
                    setClientPhone('');
                    setServiceAddress('');
                    setNotes('');
                  }}
                  className="py-3 px-4 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors"
                >
                  Novo Agendamento
                </button>
              </div>
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <h1 className="font-display text-xl font-semibold text-slate-900 mb-2">
                Nenhum serviço ativo disponível
              </h1>
              <p className="text-sm text-slate-600">
                {verifiedBusinessName} ainda não cadastrou serviços públicos para agendamento.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">
                  {verifiedBusinessName} · Portal de Agendamento
                </p>
                <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight">
                  Agendar Serviço
                </h1>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Escolha o Serviço
                </label>
                <select
                  required
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {services.map((srv) => (
                    <option key={srv.id} value={srv.id}>
                      {srv.name} — {formatBRL(srv.price)}
                    </option>
                  ))}
                </select>
                {selectedService && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    Valor: <strong className="text-slate-800 tabular-nums">{formatBRL(selectedService.price)}</strong> · Duração estimada: {selectedService.durationMinutes} min
                    {selectedService.description ? ` · ${selectedService.description}` : ''}
                  </p>
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
                    Horário Preferido
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
                    Seu Nome Completo
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.NAME_MAX}
                    placeholder="Ex: Maria Oliveira"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Seu WhatsApp (com DDD)
                  </label>
                  <input
                    type="tel"
                    required
                    minLength={8}
                    maxLength={SCHEMA_LIMITS.PHONE_MAX}
                    placeholder="Ex: 47999998888"
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
                    Endereço Completo do Serviço
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
                  Observações (opcional)
                </label>
                <textarea
                  rows={2}
                  maxLength={SCHEMA_LIMITS.NOTES_MAX}
                  placeholder="Detalhes adicionais sobre o local ou serviço"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 px-5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-medium text-sm rounded-lg transition-colors min-h-[44px]"
              >
                {submitting ? 'Agendando e salvando na planilha...' : 'Confirmar Agendamento'}
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="max-w-2xl w-full mx-auto text-center py-3 text-xs text-slate-400">
        PlanilhaFlow · Agendamento integrado à planilha automática
      </footer>
    </div>
  );
};
