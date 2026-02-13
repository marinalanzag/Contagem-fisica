# 📦 Sistema de Contagem de Estoque - O Fazendeiro LTDA

Sistema completo e robusto para contagem física de estoque com suporte a múltiplos contadores em tempo real.

## ✨ Características Principais

✅ **Múltiplos Contadores Simultâneos** - Até 50+ pessoas contando ao mesmo tempo  
✅ **Sincronização em Tempo Real** - Dados atualizados instantaneamente  
✅ **Zero Perda de Dados** - Transações ACID com lock pessimista  
✅ **Relatório Consolidado** - Soma automática de todos os produtos  
✅ **Exportação Flexível** - CSV, JSON prontos para Excel/ERP  
✅ **Dashboard Master** - Gerenciamento completo de sessões  
✅ **Responsivo** - Funciona em desktop, tablet e celular  

## 🚀 Começar em 5 Minutos

### 1. Clone o repositório
```bash
git clone https://github.com/seu-usuario/contagem-estoque.git
cd contagem-estoque
```

### 2. Instale dependências
```bash
npm install
```

### 3. Configure variáveis de ambiente
Crie arquivo `.env.local` na raiz:
```
REACT_APP_SUPABASE_URL=https://seu-projeto.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Onde conseguir:**
1. Vá em https://supabase.com
2. Crie uma conta e novo projeto
3. Vá em Settings → API
4. Copie `Project URL` e `anon public` key

### 4. Configure o banco de dados
1. No Supabase, vá em SQL Editor
2. Clique "New Query"
3. Copie TODO o conteúdo de `setup_supabase.sql`
4. Cole no editor
5. Clique "Run"

### 5. Inicie o servidor
```bash
npm start
```

Deve abrir http://localhost:3000

### 6. Teste
- Abra 2 abas do navegador
- Aba 1: "Sou Contador" → João Silva → Busque ADUBO001 → Adicione 50
- Aba 2: "Sou Contador" → Maria → Busque ADUBO001 → Adicione 30
- Aba 1 mostrará 80 unidades ✅

## 📁 Estrutura do Projeto

```
contagem-estoque/
├── src/
│   ├── components/
│   │   ├── InventoryCountingApp.jsx    (App para contadores)
│   │   └── MasterDashboard.jsx         (Dashboard administrativo)
│   ├── services/
│   │   ├── supabase_integration.js     (API para contadores)
│   │   └── master_integration.js       (API para Master)
│   ├── App.js                          (Roteamento)
│   ├── index.js
│   └── index.css
├── public/
│   └── index.html
├── setup_supabase.sql                  (Schema do banco)
├── master_queries_advanced.sql         (Queries avançadas)
├── package.json
├── tailwind.config.js
├── postcss.config.js
└── README.md
```

## 🎯 Funcionalidades

### Para Contadores 👤
- ✅ Buscar produtos com autocompletar
- ✅ Registrar quantidades
- ✅ Soma automática (mesmo item múltiplas vezes)
- ✅ Corrigir/remover itens
- ✅ Exportar relatório individual
- ✅ Sincronização em tempo real

### Para Master 👨‍💼
- ✅ Dashboard com resumo geral
- ✅ Relatório consolidado (SOMA TUDO)
- ✅ Ver quem contou cada item
- ✅ Monitorar contadores ativos
- ✅ Performance analysis
- ✅ Exportar em CSV/JSON
- ✅ Comparar com SPED (integração)

## 🔧 Tecnologias Utilizadas

- **React 18** - UI framework
- **Supabase** - Backend & PostgreSQL
- **Tailwind CSS** - Styling
- **Lucide React** - Ícones
- **JavaScript ES6+** - Linguagem

## 📊 Capacidade

- **Produtos**: 100.000+
- **Contadores simultâneos**: 50+
- **Itens por sessão**: 10.000+
- **Uptime**: 99.9% (Supabase SLA)

## 🚀 Deploy

### Vercel (Recomendado)
```bash
# 1. Faça login no Vercel
vercel login

# 2. Deploy
vercel

# 3. Adicione variáveis de ambiente
# Vercel Dashboard → Settings → Environment Variables
# REACT_APP_SUPABASE_URL=...
# REACT_APP_SUPABASE_ANON_KEY=...
```

Seu site estará em: `https://seu-app.vercel.app`

### Ou via GitHub + Vercel
1. Faça push para GitHub
2. Conecte GitHub ao Vercel
3. Vercel faz deploy automático

## 📚 Documentação

Veja os arquivos de documentação inclusos:
- `RESUMO_FINAL.md` - Visão geral completa
- `README_QUICK_START.md` - Setup rápido
- `setup_supabase.sql` - Schema do banco
- `master_queries_advanced.sql` - Queries avançadas

## 🆘 Troubleshooting

### "Module not found"
```bash
npm install @supabase/supabase-js lucide-react
```

### "REACT_APP_SUPABASE_URL undefined"
Verifique se `.env.local` está criado na raiz com as credenciais

### Produtos não aparecem
1. Verifique se `setup_supabase.sql` rodou sem erros
2. Vá em Supabase → Data → tabela `produtos`
3. Deve ter 20 itens

### Build falha no Vercel
Verifique os logs: Vercel Dashboard → Deployments → Logs

## 📞 Suporte

**Dúvidas sobre Supabase?**
- Docs: https://supabase.com/docs
- Discord: https://discord.supabase.com

**Dúvidas sobre React?**
- Docs: https://react.dev
- Stack Overflow: https://stackoverflow.com/questions/tagged/reactjs

## 📄 Licença

MIT

## 👤 Desenvolvido para

**O Fazendeiro LTDA**  
Sistema de Contagem de Estoque v1.0  
Fevereiro de 2026

---

**Bom sorte com sua contagem! 🌾📦**
