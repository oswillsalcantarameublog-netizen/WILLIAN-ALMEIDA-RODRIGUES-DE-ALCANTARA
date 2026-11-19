import { Booking, CustomSpreadsheet, DEFAULT_CONFIRM_TEMPLATE, DEFAULT_OWNER_WHATSAPP, LibrarySheet, LibrarySheetItem, ServiceItem, SpreadsheetRow } from '../types';

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDateBR(isoDate: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '—';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export function sanitizeWhatsAppPhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function formatPhoneDisplay(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '').replace(/^55/, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

export function buildWhatsAppHref(phone: string, message: string): string {
  const sanitized = sanitizeWhatsAppPhone(phone);
  const encoded = encodeURIComponent(message);
  return sanitized ? `https://wa.me/${sanitized}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
}

const CUSTOM_PUBLIC_URL_KEY = 'planilhaflow_public_base_url';

export function getStoredPublicBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(CUSTOM_PUBLIC_URL_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredPublicBaseUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean) {
      window.localStorage.setItem(CUSTOM_PUBLIC_URL_KEY, clean);
    } else {
      window.localStorage.removeItem(CUSTOM_PUBLIC_URL_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function getPublicBaseUrl(): string {
  const custom = getStoredPublicBaseUrl();
  if (custom) return custom;
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  if (origin.includes('://ais-dev-')) {
    return origin.replace('://ais-dev-', '://ais-pre-');
  }
  return origin;
}

export function getConfirmationUrl(bookingId: string, confirmToken: string): string {
  const base = getPublicBaseUrl();
  return `${base}/?confirmar=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(confirmToken)}`;
}

export function getPublicBookingUrl(ownerId: string): string {
  const base = getPublicBaseUrl();
  return `${base}/?agendar=${encodeURIComponent(ownerId)}`;
}

export function buildBookingConfirmedMessage(
  booking: Pick<Booking, 'clientName' | 'serviceName' | 'servicePrice' | 'scheduledDate' | 'scheduledTime' | 'serviceAddress'>,
  service?: ServiceItem | null,
  businessName?: string
): string {
  const template = service?.confirmMessageTemplate?.trim() || DEFAULT_CONFIRM_TEMPLATE;
  return template
    .replace(/\{cliente\}/gi, booking.clientName)
    .replace(/\{servico\}/gi, booking.serviceName)
    .replace(/\{valor\}/gi, booking.servicePrice.toFixed(2).replace('.', ','))
    .replace(/\{data\}/gi, formatDateBR(booking.scheduledDate))
    .replace(/\{hora\}/gi, booking.scheduledTime)
    .replace(/\{endereco\}/gi, booking.serviceAddress)
    .replace(/\{empresa\}/gi, businessName || 'Nossa Equipe');
}

export function buildOwnerNewBookingMessage(
  booking: Pick<Booking, 'clientName' | 'clientPhone' | 'serviceName' | 'servicePrice' | 'scheduledDate' | 'scheduledTime' | 'serviceAddress' | 'notes'>
): string {
  const lines = [
    '*NOVO SERVIÇO AGENDADO*',
    '',
    `*Serviço:* ${booking.serviceName}`,
    `*Valor:* ${formatBRL(booking.servicePrice)}`,
    `*Data:* ${formatDateBR(booking.scheduledDate)} às ${booking.scheduledTime}`,
    `*Cliente:* ${booking.clientName}`,
    `*WhatsApp do Cliente:* ${formatPhoneDisplay(booking.clientPhone)}`,
    `*Endereço do Serviço:* ${booking.serviceAddress}`,
  ];
  if (booking.notes?.trim()) {
    lines.push(`*Observações:* ${booking.notes.trim()}`);
  }
  lines.push('', 'Adicionado automaticamente na planilha de agendamentos ativos.');
  return lines.join('\n');
}

export function buildCompletionQuestionMessage(
  booking: Booking,
  businessName?: string
): string {
  const confirmUrl = getConfirmationUrl(booking.id, booking.confirmToken);
  return [
    `Olá ${booking.clientName}!`,
    `Aqui é da *${businessName || 'equipe de atendimento'}*.`,
    '',
    `O serviço *${booking.serviceName}* (${formatBRL(booking.servicePrice)}) agendado para *${formatDateBR(booking.scheduledDate)}* foi finalizado?`,
    '',
    'Por favor, clique no link abaixo para abrir o aplicativo e confirmar que o serviço foi finalizado:',
    confirmUrl,
  ].join('\n');
}

export function buildSpreadsheetWhatsAppMessage(
  bookings: Booking[],
  groupMode: 'geral' | 'servico' | 'data',
  businessName?: string
): string {
  const total = bookings.reduce((acc, b) => acc + (b.servicePrice || 0), 0);
  const header = [
    `*PLANILHA DE SERVIÇOS — ${(businessName || 'PlanilhaFlow').toUpperCase()}*`,
    `Total de agendamentos ativos: ${bookings.length}`,
    `Valor total previsto: ${formatBRL(total)}`,
    '',
  ];

  if (bookings.length === 0) {
    return [...header, 'Nenhum agendamento ativo na planilha no momento.'].join('\n');
  }

  const bodyLines: string[] = [];

  if (groupMode === 'servico') {
    const grouped = new Map<string, Booking[]>();
    bookings.forEach((b) => {
      const list = grouped.get(b.serviceName) || [];
      list.push(b);
      grouped.set(b.serviceName, list);
    });
    grouped.forEach((items, serviceName) => {
      const subTotal = items.reduce((s, i) => s + i.servicePrice, 0);
      bodyLines.push(`*SERVIÇO: ${serviceName}* (${items.length} | ${formatBRL(subTotal)})`);
      items.forEach((item, idx) => {
        bodyLines.push(
          `${idx + 1}. ${formatDateBR(item.scheduledDate)} ${item.scheduledTime} — ${item.clientName} (${formatBRL(item.servicePrice)})`
        );
        bodyLines.push(`   End.: ${item.serviceAddress}`);
      });
      bodyLines.push('');
    });
  } else if (groupMode === 'data') {
    const grouped = new Map<string, Booking[]>();
    [...bookings]
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime))
      .forEach((b) => {
        const list = grouped.get(b.scheduledDate) || [];
        list.push(b);
        grouped.set(b.scheduledDate, list);
      });
    grouped.forEach((items, dateKey) => {
      const subTotal = items.reduce((s, i) => s + i.servicePrice, 0);
      bodyLines.push(`*DATA: ${formatDateBR(dateKey)}* (${items.length} | ${formatBRL(subTotal)})`);
      items.forEach((item, idx) => {
        bodyLines.push(
          `${idx + 1}. ${item.scheduledTime} — ${item.serviceName} | ${item.clientName} (${formatBRL(item.servicePrice)})`
        );
        bodyLines.push(`   End.: ${item.serviceAddress}`);
      });
      bodyLines.push('');
    });
  } else {
    [...bookings]
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.scheduledTime.localeCompare(b.scheduledTime))
      .forEach((item, idx) => {
        const statusLabel = item.status === 'em_andamento' ? 'Em Atendimento' : 'Agendado';
        bodyLines.push(
          `${idx + 1}. *${item.serviceName}* — ${formatDateBR(item.scheduledDate)} às ${item.scheduledTime}`
        );
        bodyLines.push(`   Cliente: ${item.clientName} | Valor: ${formatBRL(item.servicePrice)} | ${statusLabel}`);
        bodyLines.push(`   Endereço: ${item.serviceAddress}`);
      });
  }

  return [...header, ...bodyLines].join('\n');
}

export function buildCustomSheetWhatsAppMessage(
  sheet: CustomSpreadsheet,
  rows: SpreadsheetRow[]
): string {
  const total = rows.reduce((acc, r) => acc + (r.amount || 0), 0);
  const lines = [
    `*PLANILHA: ${sheet.title.toUpperCase()}*`,
    `Registros: ${rows.length} | Total: ${formatBRL(total)}`,
    '',
  ];
  rows.forEach((r, idx) => {
    lines.push(
      `${idx + 1}. [${formatDateBR(r.rowDate)}] *${r.categoryOrService}* — ${r.description} (${formatBRL(r.amount)})`
    );
    if (r.clientOrContact) {
      lines.push(`   Contato: ${r.clientOrContact}${r.address ? ` | End.: ${r.address}` : ''}`);
    }
  });
  return lines.join('\n');
}

export function buildLibrarySheetWhatsAppMessage(
  sheet: LibrarySheet,
  items: LibrarySheetItem[]
): string {
  const lines = [
    `*BIBLIOTECA DE PLANILHAS — ${sheet.fileName}*`,
    `*Setor:* ${sheet.sector} · ${sheet.subcategory}`,
    `*Linhas:* ${items.length}${sheet.totalValue ? ` | *Total:* ${formatBRL(sheet.totalValue)}` : ''}`,
  ];
  if (sheet.aiSummary) {
    lines.push('', `*Resumo IA:* ${sheet.aiSummary}`);
  }
  lines.push('');

  const byCategory = new Map<string, LibrarySheetItem[]>();
  items.forEach((it) => {
    const arr = byCategory.get(it.aiCategory) || [];
    arr.push(it);
    byCategory.set(it.aiCategory, arr);
  });

  byCategory.forEach((catItems, cat) => {
    lines.push(`*Categoria: ${cat}* (${catItems.length})`);
    catItems.slice(0, 12).forEach((item, idx) => {
      const preview = item.values.filter(Boolean).slice(0, 3).join(' · ');
      lines.push(`${idx + 1}. ${preview}`);
    });
    if (catItems.length > 12) {
      lines.push(`... e mais ${catItems.length - 12} linha(s) nesta categoria.`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

export function getOwnerWhatsApp(configured?: string): string {
  const cleaned = (configured || '').replace(/\D/g, '');
  return cleaned.length >= 10 ? cleaned : DEFAULT_OWNER_WHATSAPP;
}
