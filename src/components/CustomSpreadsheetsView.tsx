import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  MessageCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  CustomSpreadsheet,
  RowStatus,
  SCHEMA_LIMITS,
  SpreadsheetGroupBy,
  SpreadsheetRow,
  SpreadsheetSegment,
} from '../types';
import { exportCustomSpreadsheetWorkbook } from '../utils/excel';
import {
  buildCustomSheetWhatsAppMessage,
  buildWhatsAppHref,
  formatBRL,
  formatDateBR,
} from '../utils/whatsapp';

interface CustomSpreadsheetsViewProps {
  ownerId: string;
  ownerWhatsapp: string;
  spreadsheets: CustomSpreadsheet[];
  onCreateSpreadsheet: (input: {
    title: string;
    segment: SpreadsheetSegment;
    groupBy: SpreadsheetGroupBy;
    description: string;
  }) => Promise<string>;
  onDeleteSpreadsheet: (sheetId: string) => Promise<void>;
}

const SEGMENT_LABELS: Record<SpreadsheetSegment, string> = {
  [SpreadsheetSegment.AUTONOMO]: 'Pessoa Autônoma',
  [SpreadsheetSegment.EMPRESA]: 'Empresa',
  [SpreadsheetSegment.SERVICOS]: 'Prestação de Serviços',
  [SpreadsheetSegment.FINANCEIRO]: 'Financeiro / Caixa',
  [SpreadsheetSegment.CLIENTES]: 'Carteira de Clientes',
};

export const CustomSpreadsheetsView: React.FC<CustomSpreadsheetsViewProps> = ({
  ownerId,
  ownerWhatsapp,
  spreadsheets,
  onCreateSpreadsheet,
  onDeleteSpreadsheet,
}) => {
  const [selectedSheetId, setSelectedSheetId] = useState<string>('');
  const [rows, setRows] = useState<SpreadsheetRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);

  // New sheet modal/panel toggle
  const [showNewSheet, setShowNewSheet] = useState(false);
  const [sheetTitle, setSheetTitle] = useState('');
  const [sheetSegment, setSheetSegment] = useState<SpreadsheetSegment>(SpreadsheetSegment.AUTONOMO);
  const [sheetGroupBy, setSheetGroupBy] = useState<SpreadsheetGroupBy>(SpreadsheetGroupBy.SERVICO);
  const [sheetDescription, setSheetDescription] = useState('');
  const [creatingSheet, setCreatingSheet] = useState(false);

  // Add row form
  const [categoryOrService, setCategoryOrService] = useState('');
  const [rowDate, setRowDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rowDescription, setRowDescription] = useState('');
  const [clientOrContact, setClientOrContact] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [rowStatus, setRowStatus] = useState<RowStatus>(RowStatus.PENDENTE);
  const [addingRow, setAddingRow] = useState(false);

  const [viewGroupBy, setViewGroupBy] = useState<SpreadsheetGroupBy>(SpreadsheetGroupBy.SERVICO);

  const activeSheet = useMemo(
    () => spreadsheets.find((s) => s.id === selectedSheetId) || spreadsheets[0] || null,
    [spreadsheets, selectedSheetId]
  );

  useEffect(() => {
    if (activeSheet) {
      setViewGroupBy(activeSheet.groupBy);
    }
  }, [activeSheet?.id]);

  useEffect(() => {
    if (!activeSheet) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    const path = `spreadsheets/${activeSheet.id}/rows`;
    const q = query(collection(db, path), where('ownerId', '==', ownerId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: SpreadsheetRow[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<SpreadsheetRow, 'id'>),
        }));
        list.sort((a, b) => a.rowDate.localeCompare(b.rowDate));
        setRows(list);
        setLoadingRows(false);
      },
      (err) => {
        setLoadingRows(false);
        handleFirestoreError(err, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [activeSheet?.id, ownerId]);

  async function handleCreateSheet(e: React.FormEvent) {
    e.preventDefault();
    if (!sheetTitle.trim()) return;
    setCreatingSheet(true);
    try {
      const id = await onCreateSpreadsheet({
        title: sheetTitle.trim().slice(0, SCHEMA_LIMITS.SHEET_TITLE_MAX),
        segment: sheetSegment,
        groupBy: sheetGroupBy,
        description: sheetDescription.trim().slice(0, SCHEMA_LIMITS.SHEET_DESC_MAX),
      });
      setSelectedSheetId(id);
      setSheetTitle('');
      setSheetDescription('');
      setShowNewSheet(false);
    } finally {
      setCreatingSheet(false);
    }
  }

  async function handleAddRow(e: React.FormEvent) {
    e.preventDefault();
    if (!activeSheet) return;
    const numAmount = Number(amount.replace(',', '.')) || 0;
    setAddingRow(true);
    const path = `spreadsheets/${activeSheet.id}/rows`;
    const newId = `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await setDoc(doc(db, path, newId), {
        ownerId,
        sheetId: activeSheet.id,
        categoryOrService: (categoryOrService.trim() || 'Geral').slice(0, SCHEMA_LIMITS.NAME_MAX),
        rowDate,
        description: rowDescription.trim().slice(0, SCHEMA_LIMITS.ROW_DESC_MAX),
        clientOrContact: clientOrContact.trim().slice(0, SCHEMA_LIMITS.NAME_MAX),
        phone: phone.trim().slice(0, SCHEMA_LIMITS.PHONE_MAX),
        address: address.trim().slice(0, SCHEMA_LIMITS.ADDRESS_MAX),
        amount: numAmount,
        status: rowStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setRowDescription('');
      setClientOrContact('');
      setPhone('');
      setAddress('');
      setAmount('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `${path}/${newId}`);
    } finally {
      setAddingRow(false);
    }
  }

  async function handleToggleRowStatus(row: SpreadsheetRow) {
    if (!activeSheet) return;
    const nextStatus =
      row.status === RowStatus.PENDENTE
        ? RowStatus.ATIVO
        : row.status === RowStatus.ATIVO
        ? RowStatus.CONCLUIDO
        : RowStatus.PENDENTE;
    const path = `spreadsheets/${activeSheet.id}/rows/${row.id}`;
    try {
      await updateDoc(doc(db, 'spreadsheets', activeSheet.id, 'rows', row.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, path);
    }
  }

  async function handleDeleteRow(rowId: string) {
    if (!activeSheet) return;
    const path = `spreadsheets/${activeSheet.id}/rows/${rowId}`;
    try {
      await deleteDoc(doc(db, 'spreadsheets', activeSheet.id, 'rows', rowId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  }

  const groupedRows = useMemo(() => {
    if (viewGroupBy === SpreadsheetGroupBy.NENHUM) {
      return [{ key: 'all', title: 'Todos os Registros', items: rows }];
    }
    const map = new Map<string, SpreadsheetRow[]>();
    rows.forEach((r) => {
      const k =
        viewGroupBy === SpreadsheetGroupBy.SERVICO
          ? r.categoryOrService
          : viewGroupBy === SpreadsheetGroupBy.DATA
          ? r.rowDate
          : r.status === RowStatus.CONCLUIDO
          ? 'Concluído'
          : r.status === RowStatus.ATIVO
          ? 'Ativo'
          : 'Pendente';
      const arr = map.get(k) || [];
      arr.push(r);
      map.set(k, arr);
    });
    return Array.from(map.entries()).map(([k, items]) => ({
      key: k,
      title: viewGroupBy === SpreadsheetGroupBy.DATA ? formatDateBR(k) : k,
      items,
    }));
  }, [rows, viewGroupBy]);

  const totalAmount = useMemo(
    () => rows.reduce((sum, r) => sum + (r.amount || 0), 0),
    [rows]
  );

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">
            Estúdio de Planilhas Profissionais
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Crie, separe e organize planilhas automáticas para empresas e profissionais autônomos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewSheet((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nova Planilha Profissional
        </button>
      </div>

      {/* Create New Spreadsheet Form */}
      {showNewSheet && (
        <form
          onSubmit={handleCreateSheet}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h3 className="font-display text-base font-bold text-slate-900">
            Criar Nova Planilha
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Nome da Planilha
              </label>
              <input
                type="text"
                required
                maxLength={SCHEMA_LIMITS.SHEET_TITLE_MAX}
                placeholder="Ex: Fluxo Mensal de Clientes"
                value={sheetTitle}
                onChange={(e) => setSheetTitle(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Perfil / Segmento
              </label>
              <select
                value={sheetSegment}
                onChange={(e) => setSheetSegment(e.target.value as SpreadsheetSegment)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
              >
                {Object.entries(SEGMENT_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Separação Automática Padrão
              </label>
              <select
                value={sheetGroupBy}
                onChange={(e) => setSheetGroupBy(e.target.value as SpreadsheetGroupBy)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
              >
                <option value={SpreadsheetGroupBy.SERVICO}>Separar por Serviço / Categoria</option>
                <option value={SpreadsheetGroupBy.DATA}>Separar por Data</option>
                <option value={SpreadsheetGroupBy.STATUS}>Separar por Status</option>
                <option value={SpreadsheetGroupBy.NENHUM}>Tabela Única</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Finalidade / Descrição (opcional)
            </label>
            <input
              type="text"
              maxLength={SCHEMA_LIMITS.SHEET_DESC_MAX}
              placeholder="Ex: Controle profissional de recebimentos e atendimentos por categoria"
              value={sheetDescription}
              onChange={(e) => setSheetDescription(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="submit"
              disabled={creatingSheet}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg"
            >
              {creatingSheet ? 'Criando...' : 'Criar Planilha'}
            </button>
            <button
              type="button"
              onClick={() => setShowNewSheet(false)}
              className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {spreadsheets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="font-display text-lg font-semibold text-slate-900">
            Crie planilhas personalizadas além da agenda
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Monte planilhas financeiras, controle de materiais, orçamentos de empresa ou registros de autônomo com exportação Excel e envio direto para WhatsApp.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Sheet Selector Sidebar */}
          <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            <div className="p-3.5 text-xs font-semibold text-slate-500">
              Suas Planilhas ({spreadsheets.length})
            </div>
            {spreadsheets.map((s) => {
              const isSelected = activeSheet?.id === s.id;
              return (
                <div
                  key={s.id}
                  className={`p-3.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                    isSelected ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                  }`}
                  onClick={() => setSelectedSheetId(s.id)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{s.title}</p>
                    <p className="text-xs text-slate-500 truncate">{SEGMENT_LABELS[s.segment]}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSpreadsheet(s.id);
                    }}
                    title="Excluir planilha"
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Active Spreadsheet Editor */}
          {activeSheet && (
            <div className="lg:col-span-9 space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">
                      {SEGMENT_LABELS[activeSheet.segment]}
                    </p>
                    <h3 className="font-display text-lg font-bold text-slate-900">
                      {activeSheet.title}
                    </h3>
                    {activeSheet.description && (
                      <p className="text-xs text-slate-600 mt-0.5">{activeSheet.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => exportCustomSpreadsheetWorkbook(activeSheet, rows)}
                      disabled={rows.length === 0}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Exportar .xlsx
                    </button>
                    <a
                      href={buildWhatsAppHref(
                        ownerWhatsapp,
                        buildCustomSheetWhatsAppMessage(activeSheet, rows)
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      Enviar no WhatsApp
                    </a>
                  </div>
                </div>

                {/* Separation Switch */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                  <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    {(
                      [
                        [SpreadsheetGroupBy.SERVICO, 'Por Serviço/Cat.'],
                        [SpreadsheetGroupBy.DATA, 'Por Data'],
                        [SpreadsheetGroupBy.STATUS, 'Por Status'],
                        [SpreadsheetGroupBy.NENHUM, 'Geral'],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setViewGroupBy(mode)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                          viewGroupBy === mode
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="text-sm font-mono font-semibold text-emerald-700 tabular-nums">
                    Total da Planilha: {formatBRL(totalAmount)}
                  </div>
                </div>

                {/* Quick Add Row Form */}
                <form
                  onSubmit={handleAddRow}
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-3 border-t border-slate-100"
                >
                  <input
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.NAME_MAX}
                    placeholder="Serviço / Categoria *"
                    value={categoryOrService}
                    onChange={(e) => setCategoryOrService(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                  <input
                    type="date"
                    required
                    value={rowDate}
                    onChange={(e) => setRowDate(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs tabular-nums"
                  />
                  <input
                    type="text"
                    required
                    maxLength={SCHEMA_LIMITS.ROW_DESC_MAX}
                    placeholder="Descrição do lançamento *"
                    value={rowDescription}
                    onChange={(e) => setRowDescription(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Valor R$ *"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs tabular-nums"
                  />
                  <input
                    type="text"
                    maxLength={SCHEMA_LIMITS.NAME_MAX}
                    placeholder="Cliente / Contato"
                    value={clientOrContact}
                    onChange={(e) => setClientOrContact(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                  <input
                    type="tel"
                    maxLength={SCHEMA_LIMITS.PHONE_MAX}
                    placeholder="Telefone / WhatsApp"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs tabular-nums"
                  />
                  <input
                    type="text"
                    maxLength={SCHEMA_LIMITS.ADDRESS_MAX}
                    placeholder="Endereço"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                  <div className="flex gap-2">
                    <select
                      value={rowStatus}
                      onChange={(e) => setRowStatus(e.target.value as RowStatus)}
                      className="flex-1 px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    >
                      <option value={RowStatus.PENDENTE}>Pendente</option>
                      <option value={RowStatus.ATIVO}>Ativo</option>
                      <option value={RowStatus.CONCLUIDO}>Concluído</option>
                    </select>
                    <button
                      type="submit"
                      disabled={addingRow}
                      className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg whitespace-nowrap"
                    >
                      + Linha
                    </button>
                  </div>
                </form>
              </div>

              {/* Rows Table */}
              {loadingRows ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : rows.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                  Adicione a primeira linha acima para preencher esta planilha.
                </div>
              ) : (
                <div className="space-y-4">
                  {groupedRows.map((group) => {
                    const sub = group.items.reduce((s, i) => s + i.amount, 0);
                    return (
                      <div
                        key={group.key}
                        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
                      >
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-900">
                            {group.title} ({group.items.length})
                          </span>
                          <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                            {formatBRL(sub)}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500">
                                <th className="py-2 px-3">Data</th>
                                <th className="py-2 px-3">Serviço/Cat.</th>
                                <th className="py-2 px-3">Descrição</th>
                                <th className="py-2 px-3">Contato / Endereço</th>
                                <th className="py-2 px-3 text-right">Valor</th>
                                <th className="py-2 px-3">Status</th>
                                <th className="py-2 px-3 text-right">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {group.items.map((r) => (
                                <tr key={r.id} className="hover:bg-slate-50">
                                  <td className="py-2.5 px-3 font-mono tabular-nums whitespace-nowrap">
                                    {formatDateBR(r.rowDate)}
                                  </td>
                                  <td className="py-2.5 px-3 font-medium text-slate-900">
                                    {r.categoryOrService}
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-700">{r.description}</td>
                                  <td className="py-2.5 px-3 text-slate-600">
                                    <div>{r.clientOrContact || '—'}</div>
                                    {r.address && (
                                      <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                                        {r.address}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                                    {formatBRL(r.amount)}
                                  </td>
                                  <td className="py-2.5 px-3 whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleRowStatus(r)}
                                      className={`inline-flex items-center gap-1 font-medium ${
                                        r.status === RowStatus.CONCLUIDO
                                          ? 'text-emerald-700'
                                          : r.status === RowStatus.ATIVO
                                          ? 'text-amber-700'
                                          : 'text-slate-600'
                                      }`}
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      {r.status === RowStatus.CONCLUIDO
                                        ? 'Concluído'
                                        : r.status === RowStatus.ATIVO
                                        ? 'Ativo'
                                        : 'Pendente'}
                                    </button>
                                  </td>
                                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteRow(r.id)}
                                      className="p-1 text-slate-400 hover:text-red-600"
                                      title="Excluir linha"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
