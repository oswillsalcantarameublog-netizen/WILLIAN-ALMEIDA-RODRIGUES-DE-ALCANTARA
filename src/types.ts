export const DEFAULT_OWNER_WHATSAPP = '47997362647';

export const DEFAULT_CONFIRM_TEMPLATE =
  'Olá {cliente}! ✅ Seu agendamento para o serviço *{servico}* (R$ {valor}) foi *CONFIRMADO*!\n📅 Data: {data} às {hora}\n📍 Endereço: {endereco}\n\nQualquer dúvida, estamos à disposição!';

export const SCHEMA_LIMITS = {
  NAME_MAX: 120,
  CATEGORY_MAX: 60,
  DESCRIPTION_MAX: 400,
  TEMPLATE_MAX: 600,
  PHONE_MAX: 25,
  ADDRESS_MAX: 280,
  NOTES_MAX: 500,
  SHEET_TITLE_MAX: 120,
  SHEET_DESC_MAX: 300,
  ROW_DESC_MAX: 200,
} as const;

export enum BookingStatus {
  AGENDADO = 'agendado',
  EM_ANDAMENTO = 'em_andamento',
  FINALIZADO = 'finalizado',
  CANCELADO = 'cancelado',
}

export enum SpreadsheetSegment {
  AUTONOMO = 'autonomo',
  EMPRESA = 'empresa',
  SERVICOS = 'servicos',
  FINANCEIRO = 'financeiro',
  CLIENTES = 'clientes',
}

export enum SpreadsheetGroupBy {
  NENHUM = 'nenhum',
  SERVICO = 'servico',
  DATA = 'data',
  STATUS = 'status',
}

export enum RowStatus {
  PENDENTE = 'pendente',
  ATIVO = 'ativo',
  CONCLUIDO = 'concluido',
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  businessName: string;
  whatsappNumber: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ServiceItem {
  id: string;
  ownerId: string;
  name: string;
  price: number;
  category: string;
  durationMinutes: number;
  description: string;
  autoConfirmMessageEnabled: boolean;
  confirmMessageTemplate: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Booking {
  id: string;
  ownerId: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  clientName: string;
  clientPhone: string;
  serviceAddress: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string; // HH:MM
  notes: string;
  status: BookingStatus;
  confirmToken: string;
  whatsappConfirmedSent: boolean;
  whatsappOwnerNotified: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ConfirmationTicket {
  id: string;
  bookingId: string;
  ownerId: string;
  serviceName: string;
  servicePrice: number;
  scheduledDate: string;
  scheduledTime: string;
  businessName: string;
  status: 'pendente' | 'finalizado';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BookingRequest {
  id: string;
  ownerId: string;
  serviceId: string;
  serviceName: string;
  servicePrice: number;
  clientName: string;
  clientPhone: string;
  serviceAddress: string;
  scheduledDate: string;
  scheduledTime: string;
  notes: string;
  processed: boolean;
  createdAt?: unknown;
}

export interface CustomSpreadsheet {
  id: string;
  ownerId: string;
  title: string;
  segment: SpreadsheetSegment;
  groupBy: SpreadsheetGroupBy;
  description: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SpreadsheetRow {
  id: string;
  ownerId: string;
  sheetId: string;
  categoryOrService: string;
  rowDate: string;
  description: string;
  clientOrContact: string;
  phone: string;
  address: string;
  amount: number;
  status: RowStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PublicProfile {
  uid: string;
  businessName: string;
  active: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LibrarySectorDef {
  id: string;
  order: number;
  name: string;
  subcategories: string[];
  featured: boolean;
}

export const LIBRARY_SECTORS: LibrarySectorDef[] = [
  {
    id: 'financas',
    order: 1,
    name: 'Finanças',
    featured: true,
    subcategories: [
      'Controle de receitas e despesas',
      'Fluxo de caixa',
      'Contas a pagar e receber',
      'Lucros e prejuízos',
      'Controle de dívidas',
      'Reserva financeira',
    ],
  },
  {
    id: 'vendas',
    order: 2,
    name: 'Vendas',
    featured: true,
    subcategories: [
      'Registro de vendas',
      'Controle de pedidos',
      'Cadastro de clientes',
      'Metas de vendas',
      'Comissão de vendedores',
      'Relatório de faturamento',
    ],
  },
  {
    id: 'servicos',
    order: 3,
    name: 'Serviços',
    featured: true,
    subcategories: [
      'Agenda de serviços',
      'Controle de atendimentos',
      'Orçamentos',
      'Cadastro de clientes',
      'Serviços concluídos e pendentes',
      'Controle de pagamentos',
    ],
  },
  {
    id: 'estoque',
    order: 4,
    name: 'Estoque e Produtos',
    featured: true,
    subcategories: [
      'Entrada e saída de mercadorias',
      'Controle de estoque',
      'Validade dos produtos',
      'Inventário',
      'Fornecedores',
      'Reposição de mercadorias',
    ],
  },
  {
    id: 'custos',
    order: 5,
    name: 'Custos e Precificação',
    featured: true,
    subcategories: [
      'Formação de preço',
      'Custo por produto',
      'Custo de mão de obra',
      'Margem de lucro',
      'Cálculo de descontos',
      'Ponto de equilíbrio',
    ],
  },
  {
    id: 'clientes',
    order: 6,
    name: 'Clientes',
    featured: true,
    subcategories: [
      'Cadastro de clientes',
      'Histórico de compras',
      'Contatos',
      'Clientes inadimplentes',
      'Pós-venda',
    ],
  },
  {
    id: 'agenda',
    order: 7,
    name: 'Agenda e Organização',
    featured: true,
    subcategories: [
      'Agenda semanal',
      'Compromissos',
      'Tarefas',
      'Prazos',
      'Calendário de entregas',
    ],
  },
  {
    id: 'impostos',
    order: 8,
    name: 'Impostos e Administração',
    featured: true,
    subcategories: [
      'Controle de DAS MEI',
      'Controle de notas fiscais',
      'Despesas administrativas',
      'Documentos',
      'Obrigações mensais',
    ],
  },
  {
    id: 'transporte',
    order: 9,
    name: 'Transporte e Entregas',
    featured: true,
    subcategories: [
      'Controle de entregas',
      'Gastos com combustível',
      'Quilometragem',
      'Manutenção de veículos',
      'Rotas e pedidos',
    ],
  },
  {
    id: 'relatorios',
    order: 10,
    name: 'Relatórios e Indicadores',
    featured: true,
    subcategories: [
      'Resultado mensal',
      'Comparativo de faturamento',
      'Gráficos de desempenho',
      'Produtos mais vendidos',
      'Indicadores de lucro',
    ],
  },
  {
    id: 'marketing',
    order: 11,
    name: 'Marketing e Divulgação',
    featured: false,
    subcategories: [
      'Campanhas e anúncios',
      'Calendário de postagens',
      'Retorno sobre investimento (ROI)',
    ],
  },
  {
    id: 'funcionarios',
    order: 12,
    name: 'Funcionários',
    featured: false,
    subcategories: [
      'Folha de pagamento',
      'Controle de ponto e escalas',
      'Benefícios e encargos',
    ],
  },
  {
    id: 'compras',
    order: 13,
    name: 'Compras e Fornecedores',
    featured: false,
    subcategories: [
      'Cotações de compra',
      'Cadastro de fornecedores',
      'Pedidos de compra',
    ],
  },
  {
    id: 'planejamento',
    order: 14,
    name: 'Planejamento e Metas',
    featured: false,
    subcategories: [
      'Metas anuais e mensais',
      'Plano de ação',
      'Projetos estratégicos',
    ],
  },
  {
    id: 'patrimonio',
    order: 15,
    name: 'Patrimônio e Equipamentos',
    featured: false,
    subcategories: [
      'Inventário de equipamentos',
      'Manutenção de máquinas',
      'Depreciação de bens',
    ],
  },
  {
    id: 'producao',
    order: 16,
    name: 'Produção e Fabricação',
    featured: false,
    subcategories: [
      'Ordens de produção',
      'Ficha técnica de insumos',
      'Controle de perdas',
    ],
  },
  {
    id: 'comissoes',
    order: 17,
    name: 'Comissões',
    featured: false,
    subcategories: [
      'Controle de comissões',
      'Repasses por vendedor/técnico',
      'Fechamento quinzenal',
    ],
  },
  {
    id: 'emprestimos',
    order: 18,
    name: 'Empréstimos e Financiamentos',
    featured: false,
    subcategories: [
      'Parcelas e amortizações',
      'Taxas de juros',
      'Saldo devedor',
    ],
  },
];

export interface LibrarySheet {
  id: string;
  ownerId: string;
  fileName: string;
  sector: string;
  subcategory: string;
  aiSummary: string;
  aiCategorized: boolean;
  rowCount: number;
  totalValue: number;
  headers: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LibrarySheetItem {
  id: string;
  ownerId: string;
  sheetId: string;
  rowIndex: number;
  aiCategory: string;
  values: string[];
  numericAmount: number;
  createdAt?: unknown;
}

