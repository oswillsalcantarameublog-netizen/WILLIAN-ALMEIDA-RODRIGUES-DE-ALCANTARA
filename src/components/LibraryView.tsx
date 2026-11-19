import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FolderOpen,
  MessageCircle,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  LIBRARY_SECTORS,
  LibrarySectorDef,
  LibrarySheet,
  LibrarySheetItem,
} from '../types';
import { exportLibrarySheetWorkbook, parseSpreadsheetFile } from '../utils/excel';
import {
  buildLibrarySheetWhatsAppMessage,
  buildWhatsAppHref,
  formatBRL,
} from '../utils/whatsapp';

interface LibraryViewProps {
  ownerId: string;
  ownerWhatsapp: string;
  sheets: LibrarySheet[];
  loading: boolean;
}

function parseNumericCell(val: string): number {
  const cleaned = String(val || '')
    .replace(/R\$/gi, '')
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(?:,|$))/g, '')
    .replace(',', '.');
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function buildStarterTemplateForSector(sector: string, subcategory: string): {
  headers: string[];
  rows: { aiCategory: string; values: string[]; numericAmount: number }[];
} {
  const today = new Date().toLocaleDateString('pt-BR');
  return {
    headers: ['Data', 'Descrição', 'Categoria', 'Responsável / Contato', 'Valor (R$)', 'Status'],
    rows: [
      {
        aiCategory: subcategory || sector,
        values: [today, `Lançamento inicial — ${subcategory}`, subcategory, 'Equipe', '0,00', 'Pendente'],
        numericAmount: 0,
      },
    ],
  };
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  ownerId,
  ownerWhatsapp,
  sheets,
  loading,
}) => {
  const [selectedSector, setSelectedSector] = useState<string>('todos');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('');
  const [expandedSectorId, setExpandedSectorId] = useState<string>('financas');
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedSheetId, setSelectedSheetId] = useState<string>('');
  const [items, setItems] = useState<LibrarySheetItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [groupByCategory, setGroupByCategory] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sectorCounts = useMemo(() => {
    const map = new Map<string, number>();
    sheets.forEach((s) => {
      map.set(s.sector, (map.get(s.sector) || 0) + 1);
    });
    return map;
  }, [sheets]);

  const filteredSheets = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return sheets.filter((s) => {
      if (selectedSector !== 'todos' && s.sector !== selectedSector) return false;
      if (selectedSubcategory && s.subcategory !== selectedSubcategory) return false;
      if (!q) return true;
      return (
        s.fileName.toLowerCase().includes(q) ||
        s.sector.toLowerCase().includes(q) ||
        s.subcategory.toLowerCase().includes(q) ||
        s.aiSummary.toLowerCase().includes(q)
      );
    });
  }, [sheets, selectedSector, selectedSubcategory, searchTerm]);

  const activeSheet = useMemo(
    () =>
      filteredSheets.find((s) => s.id === selectedSheetId) ||
      filteredSheets[0] ||
      null,
    [filteredSheets, selectedSheetId]
  );

  // Load items of the currently selected Library sheet
  useEffect(() => {
    if (!activeSheet) {
      setItems([]);
      return;
    }
    setLoadingItems(true);
    const itemsPath = `librarySheets/${activeSheet.id}/items`;
    const q = query(collection(db, itemsPath), where('ownerId', '==', ownerId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: LibrarySheetItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<LibrarySheetItem, 'id'>),
        }));
        list.sort((a, b) => a.rowIndex - b.rowIndex);
        setItems(list);
        setLoadingItems(false);
      },
      (err) => {
        setLoadingItems(false);
        handleFirestoreError(err, OperationType.LIST, itemsPath);
      }
    );
    return () => unsub();
  }, [activeSheet?.id, ownerId]);

  const categorizedGroups = useMemo(() => {
    if (!groupByCategory) {
      return [{ category: 'Todas as Linhas da Planilha', items }];
    }
    const map = new Map<string, LibrarySheetItem[]>();
    items.forEach((it) => {
      const key = it.aiCategory || 'Geral';
      const arr = map.get(key) || [];
      arr.push(it);
      map.set(key, arr);
    });
    return Array.from(map.entries()).map(([category, groupItems]) => ({
      category,
      items: groupItems,
    }));
  }, [items, groupByCategory]);

  async function classifyWithAI(fileName: string, headers: string[], rows: string[][]) {
    const resp = await fetch('/api/ai/classify-spreadsheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, headers, rows }),
    });
    const payload = await resp.json();
    if (!resp.ok) {
      throw new Error(payload?.error || 'Falha ao analisar planilha com inteligência artificial.');
    }
    return payload as {
      sector: string;
      subcategory: string;
      summary: string;
      amountColumnIndex: number;
      rowCategories: { rowIndex: number; category: string }[];
    };
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    setUploadError(null);
    setUploadStatus('Lendo arquivo da planilha...');

    try {
      const { headers, rows } = await parseSpreadsheetFile(file);
      setUploadStatus('Inteligência Artificial lendo e separando por setor e categoria...');

      const aiResult = await classifyWithAI(file.name, headers, rows);

      const categoryMap = new Map<number, string>();
      aiResult.rowCategories.forEach((rc) => {
        if (typeof rc.rowIndex === 'number' && rc.category) {
          categoryMap.set(rc.rowIndex, rc.category.trim().slice(0, 120));
        }
      });

      const sheetId = generateId('lib');
      let totalValue = 0;
      const preparedItems = rows.map((rowValues, idx) => {
        const numericAmount =
          aiResult.amountColumnIndex >= 0 && aiResult.amountColumnIndex < rowValues.length
            ? parseNumericCell(rowValues[aiResult.amountColumnIndex])
            : 0;
        totalValue += numericAmount;
        return {
          id: generateId('item'),
          rowIndex: idx,
          aiCategory: categoryMap.get(idx) || aiResult.subcategory || 'Geral',
          values: rowValues.length > 0 ? rowValues : ['—'],
          numericAmount,
        };
      });

      setUploadStatus('Salvando planilha organizada na biblioteca...');

      const batch = writeBatch(db);
      batch.set(doc(db, 'librarySheets', sheetId), {
        ownerId,
        fileName: file.name.slice(0, 160),
        sector: aiResult.sector,
        subcategory: aiResult.subcategory.slice(0, 120),
        aiSummary: aiResult.summary.slice(0, 600),
        aiCategorized: true,
        rowCount: preparedItems.length,
        totalValue: Number(totalValue.toFixed(2)),
        headers,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Batch items (capped to 200 rows per upload so single Firestore batch stays within 500 ops limit)
      preparedItems.slice(0, 200).forEach((item) => {
        batch.set(doc(db, 'librarySheets', sheetId, 'items', item.id), {
          ownerId,
          sheetId,
          rowIndex: item.rowIndex,
          aiCategory: item.aiCategory,
          values: item.values,
          numericAmount: item.numericAmount,
          createdAt: serverTimestamp(),
        });
      });

      await batch.commit();

      setSelectedSector(aiResult.sector);
      setSelectedSubcategory('');
      setSelectedSheetId(sheetId);
      setUploadStatus(null);
    } catch (err) {
      console.error(err);
      setUploadStatus(null);
      setUploadError(
        err instanceof Error ? err.message : 'Não foi possível processar a planilha enviada.'
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleCreateSectorTemplate(sectorName: string, subcategory: string) {
    setBusyId('template');
    setUploadError(null);
    try {
      const sheetId = generateId('lib');
      const tpl = buildStarterTemplateForSector(sectorName, subcategory);
      const batch = writeBatch(db);
      batch.set(doc(db, 'librarySheets', sheetId), {
        ownerId,
        fileName: `${subcategory || sectorName}.xlsx`.slice(0, 160),
        sector: sectorName,
        subcategory: (subcategory || 'Geral').slice(0, 120),
        aiSummary: `Modelo profissional criado no setor ${sectorName} (${subcategory || 'Geral'}).`,
        aiCategorized: true,
        rowCount: tpl.rows.length,
        totalValue: 0,
        headers: tpl.headers,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tpl.rows.forEach((r, idx) => {
        const itemId = generateId('item');
        batch.set(doc(db, 'librarySheets', sheetId, 'items', itemId), {
          ownerId,
          sheetId,
          rowIndex: idx,
          aiCategory: r.aiCategory,
          values: r.values,
          numericAmount: r.numericAmount,
          createdAt: serverTimestamp(),
        });
      });
      await batch.commit();
      setSelectedSheetId(sheetId);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'librarySheets');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReclassifyWithAI(sheet: LibrarySheet) {
    if (items.length === 0) return;
    setBusyId(sheet.id);
    setUploadError(null);
    try {
      const aiResult = await classifyWithAI(
        sheet.fileName,
        sheet.headers,
        items.map((it) => it.values)
      );
      const catMap = new Map<number, string>();
      aiResult.rowCategories.forEach((rc) => {
        if (typeof rc.rowIndex === 'number' && rc.category) {
          catMap.set(rc.rowIndex, rc.category.trim().slice(0, 120));
        }
      });

      const batch = writeBatch(db);
      batch.update(doc(db, 'librarySheets', sheet.id), {
        sector: aiResult.sector,
        subcategory: aiResult.subcategory.slice(0, 120),
        aiSummary: aiResult.summary.slice(0, 600),
        aiCategorized: true,
        updatedAt: serverTimestamp(),
      });
      items.forEach((it) => {
        const nextCat = catMap.get(it.rowIndex) || it.aiCategory;
        if (nextCat !== it.aiCategory) {
          batch.update(doc(db, 'librarySheets', sheet.id, 'items', it.id), {
            aiCategory: nextCat,
          });
        }
      });
      await batch.commit();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Falha ao reclassificar com IA.'
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpdateSheetSector(sheet: LibrarySheet, newSector: string) {
    try {
      await updateDoc(doc(db, 'librarySheets', sheet.id), {
        sector: newSector,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `librarySheets/${sheet.id}`);
    }
  }

  async function handleDeleteSheet(sheetId: string) {
    setBusyId(sheetId);
    try {
      const itemsSnap = await getDocs(
        query(collection(db, 'librarySheets', sheetId, 'items'), where('ownerId', '==', ownerId))
      );
      const batch = writeBatch(db);
      itemsSnap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, 'librarySheets', sheetId));
      await batch.commit();
      if (selectedSheetId === sheetId) setSelectedSheetId('');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `librarySheets/${sheetId}`);
    } finally {
      setBusyId(null);
    }
  }

  const featuredSectors = LIBRARY_SECTORS.filter((s) => s.featured);
  const extraSectors = LIBRARY_SECTORS.filter((s) => !s.featured);

  function renderSectorItem(sec: LibrarySectorDef) {
    const isExpanded = expandedSectorId === sec.id;
    const isSelected = selectedSector === sec.name;
    const count = sectorCounts.get(sec.name) || 0;

    return (
      <div key={sec.id} className="border-b border-slate-100 last:border-b-0">
        <button
          type="button"
          onClick={() => {
            setSelectedSector(sec.name);
            setSelectedSubcategory('');
            setExpandedSectorId(isExpanded ? '' : sec.id);
          }}
          className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left transition-colors ${
            isSelected ? 'bg-emerald-50/80 text-emerald-900' : 'hover:bg-slate-50 text-slate-800'
          }`}
        >
          <span className="flex items-center gap-2 text-xs font-semibold truncate">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )}
            <span className="truncate">
              {sec.order <= 10 ? `${sec.order}. ${sec.name}` : sec.name}
            </span>
          </span>
          <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
            {count}
          </span>
        </button>

        {isExpanded && (
          <div className="bg-slate-50/70 px-3 py-2 space-y-1 border-t border-slate-100">
            {sec.subcategories.map((sub) => {
              const subActive = isSelected && selectedSubcategory === sub;
              return (
                <div key={sub} className="flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSector(sec.name);
                      setSelectedSubcategory(subActive ? '' : sub);
                    }}
                    className={`flex-1 text-left px-2 py-1 rounded text-[11px] transition-colors truncate ${
                      subActive
                        ? 'bg-white text-emerald-800 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {sub}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === 'template'}
                    onClick={() => handleCreateSectorTemplate(sec.name, sub)}
                    title={`Criar planilha pronta de ${sub}`}
                    className="p-1 text-slate-400 hover:text-emerald-700 rounded shrink-0"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar: Upload + AI Auto-Separation */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Biblioteca de Planilhas por Setor com Inteligência Artificial
            </h2>
            <p className="text-sm text-slate-600 mt-0.5">
              Anexe qualquer planilha (.xlsx, .xls ou .csv). A IA lê automaticamente os dados, identifica o setor e separa todas as linhas por categoria.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Analisando com IA...' : 'Anexar Planilha (IA)'}
            </button>
          </div>
        </div>

        {uploadStatus && (
          <div className="flex items-center gap-2.5 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-900">
            <Brain className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{uploadStatus}</span>
          </div>
        )}

        {uploadError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {uploadError}
          </div>
        )}
      </div>

      {/* Main 2-Column Library Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: 18 Organized Sectors */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-3.5 border-b border-slate-200 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">
              Setores da Biblioteca
            </span>
            <button
              type="button"
              onClick={() => {
                setSelectedSector('todos');
                setSelectedSubcategory('');
              }}
              className={`text-xs font-medium px-2 py-1 rounded ${
                selectedSector === 'todos'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ver Todos ({sheets.length})
            </button>
          </div>

          <div className="max-h-[680px] overflow-y-auto divide-y divide-slate-200">
            <div>
              <div className="px-3.5 py-2 bg-slate-50 text-[11px] font-semibold text-slate-500">
                Setores Principais (1 a 10)
              </div>
              {featuredSectors.map(renderSectorItem)}
            </div>

            <div>
              <div className="px-3.5 py-2 bg-slate-50 text-[11px] font-semibold text-slate-500">
                Outros Setores Especializados
              </div>
              {extraSectors.map(renderSectorItem)}
            </div>
          </div>
        </aside>

        {/* Right: Attached Sheets List & AI Categorized Table Viewer */}
        <div className="lg:col-span-8 space-y-5">
          {/* Search & List of Sheets in Current Sector */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  {selectedSector === 'todos' ? 'Todas as Planilhas' : selectedSector}
                  {selectedSubcategory ? ` · ${selectedSubcategory}` : ''}
                </h3>
                <p className="text-xs text-slate-500 tabular-nums">
                  {filteredSheets.length} {filteredSheets.length === 1 ? 'planilha' : 'planilhas'} neste filtro
                </p>
              </div>
              <div className="relative sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar planilha..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                />
              </div>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-14 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            ) : filteredSheets.length === 0 ? (
              <div className="border border-slate-200 rounded-lg p-8 text-center space-y-3">
                <FolderOpen className="w-9 h-9 text-slate-400 mx-auto" />
                <p className="text-sm font-medium text-slate-800">
                  Nenhuma planilha neste setor ainda
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Anexe uma planilha no botão acima para a Inteligência Artificial ler e classificar automaticamente, ou crie um modelo pronto neste setor.
                </p>
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium rounded-lg"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Anexar Planilha (.xlsx / .csv)
                  </button>
                  {selectedSector !== 'todos' && (
                    <button
                      type="button"
                      onClick={() =>
                        handleCreateSectorTemplate(
                          selectedSector,
                          selectedSubcategory || 'Controle Geral'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Criar Modelo em {selectedSector}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {filteredSheets.map((s) => {
                  const isCurrent = activeSheet?.id === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSheetId(s.id)}
                      className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isCurrent ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span className="text-sm font-semibold text-slate-900 truncate">
                            {s.fileName}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {s.sector} · {s.subcategory} ·{' '}
                          <span className="tabular-nums">{s.rowCount} linha(s)</span>
                          {s.totalValue ? ` · ${formatBRL(s.totalValue)}` : ''}
                        </p>
                      </div>

                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={busyId === s.id}
                          onClick={() => handleDeleteSheet(s.id)}
                          title="Apagar planilha da biblioteca"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 bg-white hover:bg-red-50 border border-slate-200 rounded-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Apagar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Library Sheet Preview & AI Category Separation */}
          {activeSheet && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                      <Brain className="w-3.5 h-3.5" />
                      Organizada por IA
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{activeSheet.subcategory}</span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {activeSheet.fileName}
                  </h3>
                  {activeSheet.aiSummary && (
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {activeSheet.aiSummary}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busyId === activeSheet.id || items.length === 0}
                    onClick={() => handleReclassifyWithAI(activeSheet)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                  >
                    <Brain className="w-3.5 h-3.5 text-emerald-700" />
                    {busyId === activeSheet.id ? 'Reclassificando...' : 'Reanalisar IA'}
                  </button>
                  <button
                    type="button"
                    disabled={items.length === 0}
                    onClick={() => exportLibrarySheetWorkbook(activeSheet, items)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar .xlsx
                  </button>
                  <a
                    href={buildWhatsAppHref(
                      ownerWhatsapp,
                      buildLibrarySheetWhatsAppMessage(activeSheet, items)
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg whitespace-nowrap"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Enviar WhatsApp
                  </a>
                </div>
              </div>

              {/* Sector & Grouping Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-slate-600 whitespace-nowrap">
                    Setor:
                  </label>
                  <select
                    value={activeSheet.sector}
                    onChange={(e) => handleUpdateSheetSector(activeSheet, e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900"
                  >
                    {LIBRARY_SECTORS.map((sec) => (
                      <option key={sec.id} value={sec.name}>
                        {sec.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
                  <button
                    type="button"
                    onClick={() => setGroupByCategory(true)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      groupByCategory
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Separar por Categoria (IA)
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupByCategory(false)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      !groupByCategory
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tabela Completa
                  </button>
                </div>
              </div>

              {/* Rows separated by AI Category */}
              {loadingItems ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
                  ))}
                </div>
              ) : items.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  Esta planilha não possui linhas de dados.
                </p>
              ) : (
                <div className="space-y-4">
                  {categorizedGroups.map((grp) => {
                    const catTotal = grp.items.reduce(
                      (sum, it) => sum + (it.numericAmount || 0),
                      0
                    );
                    return (
                      <div
                        key={grp.category}
                        className="border border-slate-200 rounded-lg overflow-hidden"
                      >
                        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-900">
                            {grp.category} ({grp.items.length})
                          </span>
                          {catTotal !== 0 && (
                            <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                              Subtotal: {formatBRL(catTotal)}
                            </span>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500 bg-white">
                                {!groupByCategory && (
                                  <th className="py-2 px-3 whitespace-nowrap">Categoria (IA)</th>
                                )}
                                {activeSheet.headers.map((h, idx) => (
                                  <th key={idx} className="py-2 px-3 whitespace-nowrap">
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {grp.items.map((row) => (
                                <tr key={row.id} className="hover:bg-slate-50">
                                  {!groupByCategory && (
                                    <td className="py-2 px-3 font-medium text-emerald-800 whitespace-nowrap">
                                      {row.aiCategory}
                                    </td>
                                  )}
                                  {activeSheet.headers.map((_, idx) => (
                                    <td
                                      key={idx}
                                      className="py-2 px-3 text-slate-700 whitespace-nowrap max-w-[220px] truncate"
                                      title={row.values[idx] ?? ''}
                                    >
                                      {row.values[idx] || '—'}
                                    </td>
                                  ))}
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
      </div>
    </div>
  );
};
