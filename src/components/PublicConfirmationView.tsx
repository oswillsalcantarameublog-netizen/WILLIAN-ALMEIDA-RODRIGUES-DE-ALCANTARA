import React, { useEffect, useState } from 'react';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { CheckCircle2, Calendar, Clock, FileSpreadsheet, AlertCircle, ArrowLeft } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ConfirmationTicket } from '../types';
import { formatBRL, formatDateBR } from '../utils/whatsapp';

interface PublicConfirmationViewProps {
  confirmToken: string;
  onBackToApp: () => void;
}

export const PublicConfirmationView: React.FC<PublicConfirmationViewProps> = ({
  confirmToken,
  onBackToApp,
}) => {
  const [ticket, setTicket] = useState<ConfirmationTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const snap = await getDoc(doc(db, 'confirmations', confirmToken));
        if (!active) return;
        if (!snap.exists()) {
          setErrorMsg('Link de confirmação inválido ou não encontrado.');
        } else {
          const data = { id: snap.id, ...(snap.data() as Omit<ConfirmationTicket, 'id'>) };
          setTicket(data);
          if (data.status === 'finalizado') {
            setDone(true);
          }
        }
      } catch (err) {
        if (!active) return;
        console.error(err);
        setErrorMsg('Não foi possível carregar os dados deste serviço.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [confirmToken]);

  async function handleConfirmFinalized() {
    if (!ticket || ticket.status === 'finalizado') return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      await updateDoc(doc(db, 'confirmations', confirmToken), {
        status: 'finalizado',
        updatedAt: serverTimestamp(),
      });
      setTicket({ ...ticket, status: 'finalizado' });
      setDone(true);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `confirmations/${confirmToken}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-6">
      <header className="max-w-xl w-full mx-auto flex items-center justify-between py-3">
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
          Ir para o aplicativo
        </button>
      </header>

      <main className="max-w-xl w-full mx-auto my-auto py-8">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          {loading ? (
            <div className="space-y-4">
              <div className="h-6 bg-slate-100 rounded w-2/3 animate-pulse" />
              <div className="h-4 bg-slate-100 rounded w-1/2 animate-pulse" />
              <div className="h-24 bg-slate-100 rounded animate-pulse" />
            </div>
          ) : errorMsg ? (
            <div className="text-center py-6">
              <AlertCircle className="w-10 h-10 text-red-600 mx-auto mb-3" />
              <h1 className="font-display text-xl font-semibold text-slate-900 mb-2">
                Confirmação indisponível
              </h1>
              <p className="text-sm text-slate-600 mb-6">{errorMsg}</p>
              <button
                type="button"
                onClick={onBackToApp}
                className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
              >
                Abrir página inicial
              </button>
            </div>
          ) : ticket ? (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-1">
                {ticket.businessName} · Confirmação de Serviço
              </p>
              <h1 className="font-display text-2xl font-bold text-slate-900 tracking-tight mb-6">
                {done ? 'Serviço confirmado como finalizado' : 'O serviço foi finalizado?'}
              </h1>

              <div className="border-t border-b border-slate-200 py-5 mb-6 space-y-3">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-slate-500">Serviço realizado</span>
                  <span className="text-sm font-semibold text-slate-900 text-right">
                    {ticket.serviceName}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-slate-500">Valor do serviço</span>
                  <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums">
                    {formatBRL(ticket.servicePrice)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-slate-500">Data e horário</span>
                  <span className="inline-flex items-center gap-3 text-sm text-slate-700 tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {formatDateBR(ticket.scheduledDate)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      {ticket.scheduledTime}
                    </span>
                  </span>
                </div>
              </div>

              {done ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5 text-center">
                  <CheckCircle2 className="w-10 h-10 text-emerald-700 mx-auto mb-2.5" />
                  <p className="text-sm font-semibold text-emerald-950 mb-1">
                    Obrigado pela confirmação!
                  </p>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    O serviço foi marcado como concluído e removido automaticamente da planilha de pendências ativas.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleConfirmFinalized}
                    className="w-full py-3 px-5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-medium text-sm rounded-lg transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {submitting ? 'Confirmando...' : 'Confirmar que o serviço foi finalizado'}
                  </button>
                  <p className="text-xs text-slate-500 text-center">
                    Ao confirmar, o atendimento será finalizado e a planilha será atualizada automaticamente.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </main>

      <footer className="max-w-xl w-full mx-auto text-center py-3 text-xs text-slate-400">
        PlanilhaFlow · Gestão automática de serviços e planilhas
      </footer>
    </div>
  );
};
