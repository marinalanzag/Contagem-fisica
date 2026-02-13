-- ============================================================================
-- SCRIPT DE SETUP SUPABASE - CONTAGEM DE ESTOQUE
-- ============================================================================
-- Cole este script na seção "SQL Editor" do seu Supabase e execute
-- Cria toda a estrutura de banco necessária

-- 1. TABELAS BASE
-- ============================================================================

-- Tabela de Usuários Contadores
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  telefone VARCHAR(20),
  data_criacao TIMESTAMP DEFAULT NOW(),
  ativo BOOLEAN DEFAULT true
);

-- Tabela de Produtos
CREATE TABLE produtos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,
  descricao TEXT NOT NULL,
  categoria VARCHAR(100),
  unidade_padrao VARCHAR(20) DEFAULT 'UN',
  ativo BOOLEAN DEFAULT true,
  data_atualizacao TIMESTAMP DEFAULT NOW()
);

-- Tabela de Sessões de Contagem
CREATE TABLE sessoes_contagem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL,
  data_inicio TIMESTAMP DEFAULT NOW(),
  data_fim TIMESTAMP,
  status VARCHAR(20) DEFAULT 'ativa', -- 'ativa', 'concluida', 'cancelada'
  total_itens_contados INTEGER DEFAULT 0,
  total_unidades_contadas DECIMAL(15, 2) DEFAULT 0,
  observacoes TEXT,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

-- Tabela de Itens Contados (CORE)
CREATE TABLE itens_contados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id UUID NOT NULL,
  produto_id INTEGER NOT NULL,
  quantidade_total DECIMAL(12, 2) NOT NULL DEFAULT 0,
  numero_registros INTEGER DEFAULT 1,
  atualizado_por UUID NOT NULL,
  ultima_atualizacao TIMESTAMP DEFAULT NOW(),
  UNIQUE(sessao_id, produto_id),
  FOREIGN KEY (sessao_id) REFERENCES sessoes_contagem(id) ON DELETE CASCADE,
  FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT,
  FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- Tabela de Histórico (Auditoria)
CREATE TABLE historico_contagem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_contado_id UUID NOT NULL,
  quantidade_adicionada DECIMAL(12, 2) NOT NULL,
  usuario_id UUID NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW(),
  operacao VARCHAR(20) NOT NULL, -- 'ADICIONAR', 'CORRIGIR', 'REMOVER'
  ip_address VARCHAR(45),
  FOREIGN KEY (item_contado_id) REFERENCES itens_contados(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

-- 2. ÍNDICES PARA PERFORMANCE
-- ============================================================================

CREATE INDEX idx_sessoes_usuario ON sessoes_contagem(usuario_id);
CREATE INDEX idx_sessoes_status ON sessoes_contagem(status);
CREATE INDEX idx_itens_sessao ON itens_contados(sessao_id);
CREATE INDEX idx_itens_produto ON itens_contados(produto_id);
CREATE INDEX idx_historico_item ON historico_contagem(item_contado_id);
CREATE INDEX idx_historico_usuario ON historico_contagem(usuario_id);
CREATE INDEX idx_historico_timestamp ON historico_contagem(timestamp DESC);
CREATE INDEX idx_produtos_codigo ON produtos(codigo);
CREATE INDEX idx_produtos_categoria ON produtos(categoria);

-- 3. FUNÇÕES ARMAZENADAS (RPC)
-- ============================================================================

-- Função para adicionar quantidade com garantia de não-perda de dados
CREATE OR REPLACE FUNCTION adicionar_quantidade(
  p_sessao_id UUID,
  p_produto_id INTEGER,
  p_quantidade DECIMAL,
  p_usuario_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_item_id UUID;
  v_quantidade_nova DECIMAL;
  v_produto_existe BOOLEAN;
BEGIN
  -- 1. Validar que o produto existe
  SELECT EXISTS(SELECT 1 FROM produtos WHERE id = p_produto_id) INTO v_produto_existe;
  IF NOT v_produto_existe THEN
    RETURN json_build_object(
      'sucesso', false,
      'erro', 'Produto não encontrado'
    );
  END IF;

  -- 2. Validar que a sessão existe e está ativa
  IF NOT EXISTS(SELECT 1 FROM sessoes_contagem WHERE id = p_sessao_id AND status = 'ativa') THEN
    RETURN json_build_object(
      'sucesso', false,
      'erro', 'Sessão não encontrada ou não está ativa'
    );
  END IF;

  -- 3. Inserir ou atualizar (UPSERT) com transação
  INSERT INTO itens_contados (sessao_id, produto_id, quantidade_total, numero_registros, atualizado_por)
  VALUES (p_sessao_id, p_produto_id, p_quantidade, 1, p_usuario_id)
  ON CONFLICT (sessao_id, produto_id) DO UPDATE
  SET 
    quantidade_total = itens_contados.quantidade_total + p_quantidade,
    numero_registros = itens_contados.numero_registros + 1,
    atualizado_por = p_usuario_id,
    ultima_atualizacao = NOW()
  RETURNING id, quantidade_total INTO v_item_id, v_quantidade_nova;

  -- 4. Registrar no histórico para auditoria
  INSERT INTO historico_contagem 
  (item_contado_id, quantidade_adicionada, usuario_id, operacao)
  VALUES (v_item_id, p_quantidade, p_usuario_id, 'ADICIONAR');

  -- 5. Atualizar totais da sessão
  UPDATE sessoes_contagem
  SET 
    total_itens_contados = (SELECT COUNT(*) FROM itens_contados WHERE sessao_id = p_sessao_id),
    total_unidades_contadas = (SELECT COALESCE(SUM(quantidade_total), 0) FROM itens_contados WHERE sessao_id = p_sessao_id)
  WHERE id = p_sessao_id;

  -- 6. Retornar sucesso
  RETURN json_build_object(
    'sucesso', true,
    'item_id', v_item_id,
    'quantidade_total', v_quantidade_nova,
    'timestamp', NOW()
  );
END;
$$ LANGUAGE plpgsql;

-- Função para corrigir quantidade (SUBSTITUIR ao invés de SOMAR)
CREATE OR REPLACE FUNCTION corrigir_quantidade(
  p_item_id UUID,
  p_nova_quantidade DECIMAL,
  p_usuario_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_item_contado RECORD;
BEGIN
  -- 1. Obter dados do item
  SELECT * INTO v_item_contado FROM itens_contados WHERE id = p_item_id;
  
  IF v_item_contado IS NULL THEN
    RETURN json_build_object(
      'sucesso', false,
      'erro', 'Item não encontrado'
    );
  END IF;

  -- 2. Atualizar quantidade
  UPDATE itens_contados
  SET 
    quantidade_total = p_nova_quantidade,
    atualizado_por = p_usuario_id,
    ultima_atualizacao = NOW()
  WHERE id = p_item_id;

  -- 3. Registrar como CORREÇÃO no histórico
  INSERT INTO historico_contagem 
  (item_contado_id, quantidade_adicionada, usuario_id, operacao)
  VALUES (p_item_id, p_nova_quantidade - v_item_contado.quantidade_total, p_usuario_id, 'CORRIGIR');

  -- 4. Atualizar totais da sessão
  UPDATE sessoes_contagem
  SET total_unidades_contadas = (SELECT COALESCE(SUM(quantidade_total), 0) FROM itens_contados WHERE sessao_id = v_item_contado.sessao_id)
  WHERE id = v_item_contado.sessao_id;

  RETURN json_build_object(
    'sucesso', true,
    'quantidade_anterior', v_item_contado.quantidade_total,
    'quantidade_nova', p_nova_quantidade
  );
END;
$$ LANGUAGE plpgsql;

-- Função para remover item
CREATE OR REPLACE FUNCTION remover_item_contado(
  p_item_id UUID,
  p_usuario_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_sessao_id UUID;
BEGIN
  -- Obter sessão do item
  SELECT sessao_id INTO v_sessao_id FROM itens_contados WHERE id = p_item_id;

  -- Registrar remoção no histórico
  INSERT INTO historico_contagem 
  (item_contado_id, quantidade_adicionada, usuario_id, operacao)
  SELECT id, -quantidade_total, p_usuario_id, 'REMOVER'
  FROM itens_contados WHERE id = p_item_id;

  -- Deletar item
  DELETE FROM itens_contados WHERE id = p_item_id;

  -- Atualizar totais da sessão
  UPDATE sessoes_contagem
  SET 
    total_itens_contados = (SELECT COUNT(*) FROM itens_contados WHERE sessao_id = v_sessao_id),
    total_unidades_contadas = (SELECT COALESCE(SUM(quantidade_total), 0) FROM itens_contados WHERE sessao_id = v_sessao_id)
  WHERE id = v_sessao_id;

  RETURN json_build_object('sucesso', true);
END;
$$ LANGUAGE plpgsql;

-- 4. INSERIR PRODUTOS DE EXEMPLO
-- ============================================================================

INSERT INTO produtos (codigo, descricao, categoria) VALUES
('ADUBO001', 'Adubo NPK 10-10-10 (50kg)', 'Fertilizantes'),
('ADUBO002', 'Adubo Fosfatado (50kg)', 'Fertilizantes'),
('ADUBO003', 'Adubo Potássio (50kg)', 'Fertilizantes'),
('ADUBO004', 'Adubo Calcário (100kg)', 'Fertilizantes'),
('SEMENTE001', 'Sementes de Milho Híbrido (20kg)', 'Sementes'),
('SEMENTE002', 'Sementes de Soja (25kg)', 'Sementes'),
('SEMENTE003', 'Sementes de Arroz (20kg)', 'Sementes'),
('SEMENTE004', 'Sementes de Feijão (25kg)', 'Sementes'),
('PESTIC001', 'Pesticida Natural (1L)', 'Pesticidas'),
('PESTIC002', 'Fungicida (2L)', 'Pesticidas'),
('PESTIC003', 'Inseticida (5L)', 'Pesticidas'),
('PESTIC004', 'Herbicida Seletivo (5L)', 'Pesticidas'),
('VITAM001', 'Vitamina para Gado (500ml)', 'Veterinário'),
('VITAM002', 'Suplemento Mineral (1kg)', 'Veterinário'),
('VITAM003', 'Vacina Aftosa (100ml)', 'Veterinário'),
('VITAM004', 'Vermífugo Oral (1L)', 'Veterinário'),
('RACAO001', 'Ração Balanceada (25kg)', 'Pet Supplies'),
('RACAO002', 'Ração Premium Cães (15kg)', 'Pet Supplies'),
('RACAO003', 'Ração Gatos (10kg)', 'Pet Supplies'),
('RACAO004', 'Areia Sanitária (5kg)', 'Pet Supplies');

-- 5. VIEWS PARA CONSULTAS FREQUENTES
-- ============================================================================

-- View para relatório consolidado de uma sessão
CREATE OR REPLACE VIEW relatorio_sessao AS
SELECT 
  ic.sessao_id,
  p.codigo,
  p.descricao,
  p.categoria,
  p.unidade_padrao,
  ic.quantidade_total,
  ic.numero_registros,
  ic.ultima_atualizacao,
  u.nome as atualizado_por
FROM itens_contados ic
JOIN produtos p ON ic.produto_id = p.id
JOIN usuarios u ON ic.atualizado_por = u.id
ORDER BY p.codigo;

-- View para análise de contadores (performance)
CREATE OR REPLACE VIEW analise_contadores AS
SELECT 
  u.nome,
  COUNT(DISTINCT sc.id) as total_sessoes,
  SUM(COALESCE(sc.total_itens_contados, 0)) as total_itens_contados,
  SUM(COALESCE(sc.total_unidades_contadas, 0)) as total_unidades,
  MAX(sc.data_inicio) as ultima_contagem
FROM usuarios u
LEFT JOIN sessoes_contagem sc ON u.id = sc.usuario_id
GROUP BY u.id, u.nome;

-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Habilitar RLS
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes_contagem ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_contados ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_contagem ENABLE ROW LEVEL SECURITY;

-- Políticas (se usar autenticação Supabase Auth)
-- Descomente estas linhas se implementar autenticação Supabase:

-- CREATE POLICY "Usuários veem apenas suas sessões"
-- ON sessoes_contagem FOR SELECT
-- USING (usuario_id = auth.uid());

-- CREATE POLICY "Usuários podem criar suas sessões"
-- ON sessoes_contagem FOR INSERT
-- WITH CHECK (usuario_id = auth.uid());

-- ============================================================================
-- FIM DO SCRIPT
-- ============================================================================
