import * as XLSX from 'xlsx';
import { Booking, CustomSpreadsheet, LibrarySheet, LibrarySheetItem, SpreadsheetRow } from '../types';
import { formatDateBR } from './whatsapp';

function sanitizeSheetName(name: string, fallback: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim();
  const sliced = cleaned.slice(0, 31).trim();
  return sliced || fallback;
}

function uniqueSheetName(base: string, used: Set<string>): string {
  let candidate = sanitizeSheetName(base, 'Planilha');
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${counter})`;
    candidate = sanitizeSheetName(candidate.slice(0, 31 - suffix.length) + suffix, `Planilha${counter}`);
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function buildBookingRows(items: Booking[]) {
  return items.map((b) => ({
    Data: formatDateBR(b.scheduledDate),
    Horário: b.scheduledTime,
    Serviço: b.serviceName,
    Cliente: b.clientName,
    WhatsApp: b.clientPhone,
    'Endereço do Serviço': b.serviceAddress,
    'Valor (R$)': Number(b.servicePrice.toFixed(2)),
    Status:
      b.status === 'em_andamento'
        ? 'Em Atendimento'
        : b.status === 'finalizado'
        ? 'Finalizado'
        : b.status === 'cancelado'
        ? 'Cancelado'
        : 'Agendado',
    Observações: b.notes || '',
  }));
}

function applyColumnWidths(ws: XLSX.WorkSheet) {
  ws['!cols'] = [
    { wch: 13 }, // Data
    { wch: 10 }, // Horário
    { wch: 24 }, // Serviço
    { wch: 22 }, // Cliente
    { wch: 18 }, // WhatsApp
    { wch: 38 }, // Endereço
    { wch: 14 }, // Valor
    { wch: 16 }, // Status
    { wch: 28 }, // Observações
  ];
}

export function exportBookingsWorkbook(
  bookings: Booking[],
  filePrefix = 'Planilha_Servicos_Ativos'
) {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  const sorted = [...bookings].sort(
    (a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime)
  );

  // 1. Aba Geral
  const generalRows = buildBookingRows(sorted);
  const totalGeneral = sorted.reduce((acc, b) => acc + b.servicePrice, 0);
  const wsGeneral = XLSX.utils.json_to_sheet([
    ...generalRows,
    {
      Data: '',
      Horário: '',
      Serviço: 'TOTAL GERAL',
      Cliente: `${sorted.length} registro(s)`,
      WhatsApp: '',
      'Endereço do Serviço': '',
      'Valor (R$)': Number(totalGeneral.toFixed(2)),
      Status: '',
      Observações: '',
    },
  ]);
  applyColumnWidths(wsGeneral);
  XLSX.utils.book_append_sheet(wb, wsGeneral, uniqueSheetName('Planilha Geral', usedNames));

  // 2. Abas separadas por Serviço
  const byService = new Map<string, Booking[]>();
  sorted.forEach((b) => {
    const arr = byService.get(b.serviceName) || [];
    arr.push(b);
    byService.set(b.serviceName, arr);
  });
  byService.forEach((items, serviceName) => {
    const subTotal = items.reduce((s, i) => s + i.servicePrice, 0);
    const ws = XLSX.utils.json_to_sheet([
      ...buildBookingRows(items),
      {
        Data: '',
        Horário: '',
        Serviço: `TOTAL (${serviceName})`,
        Cliente: `${items.length} registro(s)`,
        WhatsApp: '',
        'Endereço do Serviço': '',
        'Valor (R$)': Number(subTotal.toFixed(2)),
        Status: '',
        Observações: '',
      },
    ]);
    applyColumnWidths(ws);
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(`Serv - ${serviceName}`, usedNames));
  });

  // 3. Abas separadas por Data
  const byDate = new Map<string, Booking[]>();
  sorted.forEach((b) => {
    const arr = byDate.get(b.scheduledDate) || [];
    arr.push(b);
    byDate.set(b.scheduledDate, arr);
  });
  byDate.forEach((items, dateKey) => {
    const subTotal = items.reduce((s, i) => s + i.servicePrice, 0);
    const dateBr = formatDateBR(dateKey).replace(/\//g, '-');
    const ws = XLSX.utils.json_to_sheet([
      ...buildBookingRows(items),
      {
        Data: formatDateBR(dateKey),
        Horário: '',
        Serviço: 'TOTAL DO DIA',
        Cliente: `${items.length} registro(s)`,
        WhatsApp: '',
        'Endereço do Serviço': '',
        'Valor (R$)': Number(subTotal.toFixed(2)),
        Status: '',
        Observações: '',
      },
    ]);
    applyColumnWidths(ws);
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(`Data ${dateBr}`, usedNames));
  });

  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filePrefix}_${today}.xlsx`);
}

export function exportCustomSpreadsheetWorkbook(sheet: CustomSpreadsheet, rows: SpreadsheetRow[]) {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  const toExcelRow = (r: SpreadsheetRow) => ({
    Data: formatDateBR(r.rowDate),
    'Serviço / Categoria': r.categoryOrService,
    Descrição: r.description,
    'Cliente / Contato': r.clientOrContact,
    Telefone: r.phone,
    Endereço: r.address,
    'Valor (R$)': Number(r.amount.toFixed(2)),
    Status: r.status === 'concluido' ? 'Concluído' : r.status === 'ativo' ? 'Ativo' : 'Pendente',
  });

  const sorted = [...rows].sort((a, b) => a.rowDate.localeCompare(b.rowDate));
  const total = sorted.reduce((acc, r) => acc + r.amount, 0);

  const wsMain = XLSX.utils.json_to_sheet([
    ...sorted.map(toExcelRow),
    {
      Data: '',
      'Serviço / Categoria': 'TOTAL',
      Descrição: `${sorted.length} linha(s)`,
      'Cliente / Contato': '',
      Telefone: '',
      Endereço: '',
      'Valor (R$)': Number(total.toFixed(2)),
      Status: '',
    },
  ]);
  wsMain['!cols'] = [
    { wch: 13 },
    { wch: 24 },
    { wch: 30 },
    { wch: 22 },
    { wch: 18 },
    { wch: 32 },
    { wch: 14 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMain, uniqueSheetName(sheet.title, usedNames));

  // Separate sheets by category/service
  const byCategory = new Map<string, SpreadsheetRow[]>();
  sorted.forEach((r) => {
    const arr = byCategory.get(r.categoryOrService) || [];
    arr.push(r);
    byCategory.set(r.categoryOrService, arr);
  });
  byCategory.forEach((items, key) => {
    const sub = items.reduce((s, i) => s + i.amount, 0);
    const ws = XLSX.utils.json_to_sheet([
      ...items.map(toExcelRow),
      {
        Data: '',
        'Serviço / Categoria': `TOTAL (${key})`,
        Descrição: `${items.length} linha(s)`,
        'Cliente / Contato': '',
        Telefone: '',
        Endereço: '',
        'Valor (R$)': Number(sub.toFixed(2)),
        Status: '',
      },
    ]);
    ws['!cols'] = wsMain['!cols'];
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(key, usedNames));
  });

  const safeTitle = sheet.title.replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `${safeTitle}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function parseSpreadsheetFile(file: File): Promise<{
  headers: string[];
  rows: string[][];
}> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('A planilha enviada não possui nenhuma aba válida.');
  }
  const sheet = wb.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  const nonEmpty = matrix.filter(
    (row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
  );

  if (nonEmpty.length === 0) {
    throw new Error('A planilha está vazia.');
  }

  const rawHeaders = nonEmpty[0].slice(0, 25);
  const headers = rawHeaders.map((h, idx) => {
    const clean = String(h ?? '').trim();
    return clean ? clean.slice(0, 80) : `Coluna ${idx + 1}`;
  });

  const colCount = headers.length;
  const rows = nonEmpty.slice(1, 201).map((r) =>
    Array.from({ length: colCount }, (_, idx) => String(r[idx] ?? '').trim().slice(0, 240))
  );

  return { headers, rows };
}

export function exportLibrarySheetWorkbook(
  sheet: LibrarySheet,
  items: LibrarySheetItem[]
) {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  const toObj = (item: LibrarySheetItem) => {
    const row: Record<string, string> = {
      'Categoria (IA)': item.aiCategory,
    };
    sheet.headers.forEach((h, idx) => {
      row[h] = item.values[idx] ?? '';
    });
    return row;
  };

  const sorted = [...items].sort((a, b) => a.rowIndex - b.rowIndex);
  const wsMain = XLSX.utils.json_to_sheet(sorted.map(toObj));
  wsMain['!cols'] = [{ wch: 24 }, ...sheet.headers.map(() => ({ wch: 20 }))];
  XLSX.utils.book_append_sheet(wb, wsMain, uniqueSheetName('Geral Organizada', usedNames));

  const byCat = new Map<string, LibrarySheetItem[]>();
  sorted.forEach((it) => {
    const list = byCat.get(it.aiCategory) || [];
    list.push(it);
    byCat.set(it.aiCategory, list);
  });

  byCat.forEach((catItems, catName) => {
    const ws = XLSX.utils.json_to_sheet(catItems.map(toObj));
    ws['!cols'] = wsMain['!cols'];
    XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(catName, usedNames));
  });

  const safeName = sheet.fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
  XLSX.writeFile(wb, `${safeName}_organizada_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

