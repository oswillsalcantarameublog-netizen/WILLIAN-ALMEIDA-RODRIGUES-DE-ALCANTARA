import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIBRARY_SECTORS = [
  'Finanças',
  'Vendas',
  'Serviços',
  'Estoque e Produtos',
  'Custos e Precificação',
  'Clientes',
  'Agenda e Organização',
  'Impostos e Administração',
  'Transporte e Entregas',
  'Relatórios e Indicadores',
  'Marketing e Divulgação',
  'Funcionários',
  'Compras e Fornecedores',
  'Planejamento e Metas',
  'Patrimônio e Equipamentos',
  'Produção e Fabricação',
  'Comissões',
  'Empréstimos e Financiamentos',
] as const;

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '4mb' }));

  app.post('/api/ai/classify-spreadsheet', async (req, res) => {
    try {
      const { fileName, headers, rows } = req.body as {
        fileName?: string;
        headers?: string[];
        rows?: string[][];
      };

      if (!Array.isArray(headers) || headers.length === 0 || !Array.isArray(rows)) {
        res.status(400).json({ error: 'Envie os cabeçalhos e linhas da planilha.' });
        return;
      }

      if (!process.env.GEMINI_API_KEY) {
        res.status(500).json({
          error: 'Chave da API Gemini não configurada no servidor (Settings > Secrets).',
        });
        return;
      }

      const cappedRows = rows.slice(0, 120);
      const formattedPreview = cappedRows
        .map((r, idx) => `Linha ${idx}: ${r.map((c) => String(c ?? '')).join(' | ')}`)
        .join('\n');

      const prompt = [
        `Analise esta planilha chamada "${String(fileName || 'planilha.xlsx')}".`,
        `Colunas (${headers.length}): ${headers.map((h, i) => `[${i}] ${h}`).join(', ')}`,
        '',
        'Dados das linhas:',
        formattedPreview || '(Sem linhas)',
        '',
        'Tarefas obrigatórias:',
        `1. Escolha exatamente UM setor principal da lista oficial: ${LIBRARY_SECTORS.join(', ')}.`,
        '2. Defina a subcategoria mais adequada em português (ex: "Fluxo de caixa", "Controle de estoque", "Agenda de serviços", "Controle de DAS MEI", "Contas a pagar e receber", etc.).',
        '3. Escreva um resumo objetivo (máx. 2 frases) explicando o conteúdo e totais identificados.',
        '4. Indique o índice da coluna numérica que representa o valor monetário principal (amountColumnIndex), ou -1 se não houver coluna de valor.',
        '5. Para cada linha enviada (rowIndex de 0 até N-1), atribua uma categoria clara em português para separar automaticamente os itens por categoria (ex: "Receitas", "Despesas Fixas", "Materiais", "Manutenção", "Impostos", nome do serviço, fornecedor ou grupo).',
      ].join('\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'Você é um analista contábil e especialista em organização de planilhas empresariais brasileiras. Responda estritamente no JSON estruturado solicitado.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sector: {
                type: Type.STRING,
                description: 'Um dos 18 setores oficiais fornecidos no prompt.',
              },
              subcategory: {
                type: Type.STRING,
                description: 'Subcategoria específica dentro do setor.',
              },
              summary: {
                type: Type.STRING,
                description: 'Resumo curto e profissional da planilha em português.',
              },
              amountColumnIndex: {
                type: Type.INTEGER,
                description: 'Índice 0-based da coluna de valor monetário principal, ou -1.',
              },
              rowCategories: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    rowIndex: { type: Type.INTEGER },
                    category: { type: Type.STRING },
                  },
                  required: ['rowIndex', 'category'],
                },
              },
            },
            required: ['sector', 'subcategory', 'summary', 'amountColumnIndex', 'rowCategories'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as {
        sector?: string;
        subcategory?: string;
        summary?: string;
        amountColumnIndex?: number;
        rowCategories?: { rowIndex: number; category: string }[];
      };

      const validSector = LIBRARY_SECTORS.includes(parsed.sector as (typeof LIBRARY_SECTORS)[number])
        ? parsed.sector
        : 'Finanças';

      res.json({
        sector: validSector,
        subcategory: String(parsed.subcategory || 'Geral').slice(0, 120),
        summary: String(parsed.summary || 'Planilha processada pela inteligência artificial.').slice(0, 600),
        amountColumnIndex:
          typeof parsed.amountColumnIndex === 'number' ? parsed.amountColumnIndex : -1,
        rowCategories: Array.isArray(parsed.rowCategories) ? parsed.rowCategories : [],
      });
    } catch (err) {
      console.error('Erro na classificação IA da planilha:', err);
      const message =
        err instanceof Error ? err.message : 'Falha ao processar a planilha com inteligência artificial.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor PlanilhaFlow rodando na porta ${PORT}`);
  });
}

startServer();
