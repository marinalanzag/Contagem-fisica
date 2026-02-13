-- ============================================================================
-- QUERIES AVANÇADAS PARA DASHBOARD MASTER
-- ============================================================================
-- Use estas queries diretamente no Supabase SQL Editor ou em RPC functions

-- 1. RELATÓRIO CONSOLIDADO - SOMA TODOS OS PRODUTOS
-- ============================================================================

CREATE OR REPLACE FUNCTION obter_relatorio_consolidado(
  p_data_inicio TIMESTAMP DEFAULT NOW() - INTERVAL '30 days',
  p_data_fim TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE (
  produto_id INTEGER,
  codigo VARCHAR,
  descricao TEXT,
  categoria VARCHAR,
  unidade VARCHAR,
  quantidade_total DECIMAL,
  numero_registros INTEGER,
  contadores_envolvidos TEXT[],
  num_contadores INTEGER,
  ultima_atualizacao TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.codigo,
    p.descricao,
    p.categoria,
    p.unidade_padrao,
    SUM(ic.quantidade_total)::DECIMAL,
    SUM(ic.numero_registros)::INTEGER,
    ARRAY_AGG(DISTINCT u.nome ORDER BY u.nome)::TEXT[],
    COUNT(DISTINCT u.id)::INTEGER,
    MAX(ic.ultima_atualizacao)
  FROM itens_contados ic
  JOIN produtos p ON ic.produto_id = p.id
  JOIN sessoes_contagem sc ON ic.sessao_id = sc.id
  JOIN usuarios u ON sc.usuario_id = u.id
  WHERE sc.data_inicio >= p_data_inicio 
    AND sc.data_inicio <= p_data_fim
  GROUP BY p.id, p.codigo, p.descricao, p.categoria, p.unidade_padrao
  ORDER BY p.codigo ASC;
END;
$$ LANGUAGE plpgsql;

-- Usar: SELECT * FROM obter_relatorio_consolidado();


-- 2. RESUMO POR CATEGORIA
-- ============================================================================

CREATE OR REPLACE FUNCTION obter_resumo_categoria(
  p_data_inicio TIMESTAMP DEFAULT NOW() - INTERVAL '30 days',
  p_data_fim TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE (
  categoria VARCHAR,
  quantidade_total DECIMAL,
  num_itens_unicos INTEGER,
  percentual_total DECIMAL
) AS $$
DECLARE
  v_total DECIMAL;
BEGIN
  -- Calcular total geral
  SELECT SUM(ic.quantidade_total) INTO v_total
  FROM itens_contados ic
  JOIN sessoes_contagem sc ON ic.sessao_id = sc.id
  WHERE sc.data_inicio >= p_data_inicio 
    AND sc.data_inicio <= p_data_fim;

  RETURN QUERY
  SELECT 
    p.categoria,
    SUM(ic.quantidade_total)::DECIMAL,
    COUNT(DISTINCT ic.produto_id)::INTEGER,
    CASE 
      WHEN v_total > 0 THEN ((SUM(ic.quantidade_total) / v_total) * 100)::DECIMAL
      ELSE 0
    END
  FROM itens_contados ic
  JOIN produtos p ON ic.produto_id = p.id
  JOIN sessoes_contagem sc ON ic.sessao_id = sc.id
  WHERE sc.data_inicio >= p_data_inicio 
    AND sc.data_inicio <= p_data_fim
  GROUP BY p.categoria
  ORDER BY SUM(ic.quantidade_total) DESC;
END;
$$ LANGUAGE plpgsql;

-- Usar: SELECT * FROM obter_resumo_categoria();


-- 3. PERFORMANCE DOS CONTADORES
-- ============================================================================

CREATE OR REPLACE FUNCTION obter_performance_contadores(
  p_data_inicio TIMESTAMP DEFAULT NOW() - INTERVAL '30 days',
  p_data_fim TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE (
  usuario_id UUID,
  nome_contador VARCHAR,
  total_sessoes INTEGER,
  total_itens_contados INTEGER,
  total_unidades DECIMAL,
  tempo_total_minutos DECIMAL,
  media_itens_por_sessao DECIMAL,
  media_unidades_por_sessao DECIMAL,
  velocidade_itens_por_minuto DECIMAL,
  velocidade_unidades_por_minuto DECIMAL,
  eficiencia_percentual DECIMAL
) AS $$
DECLARE
  v_total_unidades DECIMAL;
  v_total_contadores INTEGER;
BEGIN
  -- Obter totais para cálculo de percentual
  SELECT 
    SUM(sc.total_unidades_contadas),
    COUNT(DISTINCT sc.usuario_id)
  INTO v_total_unidades, v_total_contadores
  FROM sessoes_contagem sc
  WHERE sc.data_inicio >= p_data_inicio 
    AND sc.data_inicio <= p_data_fim;

  RETURN QUERY
  SELECT 
    u.id,
    u.nome,
    COUNT(sc.id)::INTEGER,
    COALESCE(SUM(sc.total_itens_contados), 0)::INTEGER,
    COALESCE(SUM(sc.total_unidades_contadas), 0)::DECIMAL,
    COALESCE(
      SUM(EXTRACT(EPOCH FROM (COALESCE(sc.data_fim, NOW()) - sc.data_inicio)) / 60),
      0
    )::DECIMAL,
    CASE 
      WHEN COUNT(sc.id) > 0 THEN (SUM(sc.total_itens_contados)::DECIMAL / COUNT(sc.id))
      ELSE 0
    END,
    CASE 
      WHEN COUNT(sc.id) > 0 THEN (SUM(sc.total_unidades_contadas)::DECIMAL / COUNT(sc.id))
      ELSE 0
    END,
    CASE 
      WHEN SUM(EXTRACT(EPOCH FROM (COALESCE(sc.data_fim, NOW()) - sc.data_inicio)) / 60) > 0
        THEN (SUM(sc.total_itens_contados)::DECIMAL / (SUM(EXTRACT(EPOCH FROM (COALESCE(sc.data_fim, NOW()) - sc.data_inicio)) / 60)))
      ELSE 0
    END,
    CASE 
      WHEN SUM(EXTRACT(EPOCH FROM (COALESCE(sc.data_fim, NOW()) - sc.data_inicio)) / 60) > 0
        THEN (SUM(sc.total_unidades_contadas)::DECIMAL / (SUM(EXTRACT(EPOCH FROM (COALESCE(sc.data_fim, NOW()) - sc.data_inicio)) / 60)))
      ELSE 0
    END,
    CASE 
      WHEN v_total_unidades > 0 THEN ((SUM(sc.total_unidades_contadas)::DECIMAL / v_total_unidades) * 100)
      ELSE 0
    END
  FROM usuarios u
  LEFT JOIN sessoes_contagem sc ON u.id = sc.usuario_id 
    AND sc.data_inicio >= p_data_inicio 
    AND sc.data_inicio <= p_data_fim
  GROUP BY u.id, u.nome
  ORDER BY SUM(sc.total_unidades_contadas) DESC NULLS LAST;
END;
$$ LANGUAGE plpgsql;

-- Usar: SELECT * FROM obter_performance_contadores();


-- 4. DISCREPÂNCIAS COM SPED (Comparação)
-- ============================================================================

CREATE TABLE IF NOT EXISTS sped_produtos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) UNIQUE NOT NULL,
  quantidade_sped DECIMAL,
  data_sped DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION comparar_contagem_com_sped()
RETURNS TABLE (
  codigo VARCHAR,
  descricao TEXT,
  quantidade_contagem DECIMAL,
  quantidade_sped DECIMAL,
  diferenca DECIMAL,
  percentual_diferenca DECIMAL,
  tipo_discrepancia VARCHAR
) AS $$
BEGIN
  -- Produtos em ambos com diferença
  RETURN QUERY
  SELECT DISTINCT
    p.codigo,
    p.descricao,
    rc.quantidade_total,
    sp.quantidade_sped,
    rc.quantidade_total - sp.quantidade_sped,
    CASE 
      WHEN sp.quantidade_sped > 0 THEN (((rc.quantidade_total - sp.quantidade_sped) / sp.quantidade_sped) * 100)::DECIMAL
      ELSE 0
    END,
    'DIFERENÇA'::VARCHAR
  FROM obter_relatorio_consolidado() rc
  JOIN sped_produtos sp ON rc.codigo = sp.codigo
  WHERE ABS(rc.quantidade_total - sp.quantidade_sped) > 0.01

  UNION ALL

  -- Produtos contados mas não no SPED
  SELECT 
    rc.codigo,
    rc.descricao,
    rc.quantidade_total,
    0::DECIMAL,
    rc.quantidade_total,
    100::DECIMAL,
    'NÃO_ENCONTRADO_SPED'::VARCHAR
  FROM obter_relatorio_consolidado() rc
  WHERE NOT EXISTS (
    SELECT 1 FROM sped_produtos sp WHERE sp.codigo = rc.codigo
  )

  UNION ALL

  -- Produtos no SPED mas não contados
  SELECT 
    sp.codigo,
    'Não encontrado em contagem'::TEXT,
    0::DECIMAL,
    sp.quantidade_sped,
    -sp.quantidade_sped,
    -100::DECIMAL,
    'NÃO_ENCONTRADO_CONTAGEM'::VARCHAR
  FROM sped_produtos sp
  WHERE NOT EXISTS (
    SELECT 1 FROM obter_relatorio_consolidado() rc WHERE rc.codigo = sp.codigo
  )
  
  ORDER BY ABS(diferenca) DESC;
END;
$$ LANGUAGE plpgsql;

-- Usar: SELECT * FROM comparar_contagem_com_sped();


-- 5. PRODUTOS MAIS CONTADOS
-- ============================================================================

CREATE OR REPLACE FUNCTION obter_produtos_mais_contados(
  p_limite INTEGER DEFAULT 20,
  p_data_inicio TIMESTAMP DEFAULT NOW() - INTERVAL '30 days',
  p_data_fim TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE (
  ranking INTEGER,
  codigo VARCHAR,
  descricao TEXT,
  categoria VARCHAR,
  quantidade DECIMAL,
  num_contadores INTEGER,
  percentual_do_total DECIMAL
) AS $$
DECLARE
  v_total DECIMAL;
BEGIN
  SELECT SUM(ic.quantidade_total) INTO v_total
  FROM itens_contados ic
  JOIN sessoes_contagem sc ON ic.sessao_id = sc.id
  WHERE sc.data_inicio >= p_data_inicio 
    AND sc.data_inicio <= p_data_fim;

  RETURN QUERY
  SELECT 
    ROW_NUMBER() OVER (ORDER BY SUM(ic.quantidade_total) DESC)::INTEGER,
    p.codigo,
    p.descricao,
    p.categoria,
    SUM(ic.quantidade_total)::DECIMAL,
    COUNT(DISTINCT sc.usuario_id)::INTEGER,
    CASE 
      WHEN v_total > 0 THEN ((SUM(ic.quantidade_total) / v_total) * 100)::DECIMAL
      ELSE 0
    END
  FROM itens_contados ic
  JOIN produtos p ON ic.produto_id = p.id
  JOIN sessoes_contagem sc ON ic.sessao_id = sc.id
  WHERE sc.data_inicio >= p_data_inicio 
    AND sc.data_inicio <= p_data_fim
  GROUP BY p.id, p.codigo, p.descricao, p.categoria
  ORDER BY SUM(ic.quantidade_total) DESC
  LIMIT p_limite;
END;
$$ LANGUAGE plpgsql;

-- Usar: SELECT * FROM obter_produtos_mais_contados(20);


-- 6. TIMELINE DE CONTAGEM (por contador)
-- ============================================================================

CREATE OR REPLACE FUNCTION obter_timeline_contagem(
  p_usuario_id UUID DEFAULT NULL
)
RETURNS TABLE (
  usuario_nome VARCHAR,
  produto_codigo VARCHAR,
  quantidade DECIMAL,
  operacao VARCHAR,
  timestamp TIMESTAMP,
  ordem INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.nome,
    p.codigo,
    hc.quantidade_adicionada,
    hc.operacao,
    hc.timestamp,
    ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY hc.timestamp) AS ordem
  FROM historico_contagem hc
  JOIN usuarios u ON hc.usuario_id = u.id
  JOIN itens_contados ic ON hc.item_contado_id = ic.id
  JOIN produtos p ON ic.produto_id = p.id
  WHERE (p_usuario_id IS NULL OR hc.usuario_id = p_usuario_id)
  ORDER BY hc.timestamp DESC;
END;
$$ LANGUAGE plpgsql;

-- Usar: SELECT * FROM obter_timeline_contagem();


-- 7. ESTATÍSTICAS GERAIS
-- ============================================================================

CREATE OR REPLACE FUNCTION obter_estatisticas_gerais(
  p_data_inicio TIMESTAMP DEFAULT NOW() - INTERVAL '30 days',
  p_data_fim TIMESTAMP DEFAULT NOW()
)
RETURNS TABLE (
  metrica VARCHAR,
  valor TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'Total de Sessões'::VARCHAR, COUNT(DISTINCT sc.id)::TEXT
  FROM sessoes_contagem sc
  WHERE sc.data_inicio >= p_data_inicio AND sc.data_inicio <= p_data_fim
  
  UNION ALL
  SELECT 'Sessões Ativas', COUNT(*)::TEXT
  FROM sessoes_contagem WHERE status = 'ativa'
  
  UNION ALL
  SELECT 'Sessões Concluídas', COUNT(*)::TEXT
  FROM sessoes_contagem WHERE status = 'concluida'
  
  UNION ALL
  SELECT 'Total de Usuários', COUNT(DISTINCT usuario_id)::TEXT
  FROM sessoes_contagem sc
  WHERE sc.data_inicio >= p_data_inicio AND sc.data_inicio <= p_data_fim
  
  UNION ALL
  SELECT 'Total de Produtos Contados', COUNT(DISTINCT ic.produto_id)::TEXT
  FROM itens_contados ic
  JOIN sessoes_contagem sc ON ic.sessao_id = sc.id
  WHERE sc.data_inicio >= p_data_inicio AND sc.data_inicio <= p_data_fim
  
  UNION ALL
  SELECT 'Total de Unidades Contadas', 
    ROUND(SUM(ic.quantidade_total)::NUMERIC, 2)::TEXT
  FROM itens_contados ic
  JOIN sessoes_contagem sc ON ic.sessao_id = sc.id
  WHERE sc.data_inicio >= p_data_inicio AND sc.data_inicio <= p_data_fim
  
  UNION ALL
  SELECT 'Total de Registros', COUNT(*)::TEXT
  FROM historico_contagem hc
  WHERE hc.timestamp >= p_data_inicio AND hc.timestamp <= p_data_fim
  
  UNION ALL
  SELECT 'Tempo Médio Sessão (min)', 
    ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(sc.data_fim, NOW()) - sc.data_inicio)) / 60)::NUMERIC, 2)::TEXT
  FROM sessoes_contagem sc
  WHERE sc.data_inicio >= p_data_inicio AND sc.data_inicio <= p_data_fim
    AND sc.data_fim IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Usar: SELECT * FROM obter_estatisticas_gerais();


-- 8. AUDITORIA - TODAS AS OPERAÇÕES
-- ============================================================================

CREATE TABLE IF NOT EXISTS auditoria_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES usuarios(id),
  acao VARCHAR(255) NOT NULL,
  detalhes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_auditoria_admin ON auditoria_master(admin_id);
CREATE INDEX idx_auditoria_timestamp ON auditoria_master(timestamp DESC);

CREATE OR REPLACE FUNCTION registrar_auditoria_master(
  p_admin_id UUID,
  p_acao VARCHAR,
  p_detalhes JSONB DEFAULT NULL,
  p_ip VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO auditoria_master (admin_id, acao, detalhes, ip_address)
  VALUES (p_admin_id, p_acao, p_detalhes, p_ip)
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;


-- 9. VIEWS PARA FACILITAR CONSULTAS
-- ============================================================================

-- View: Relatório Consolidado
CREATE OR REPLACE VIEW vw_relatorio_consolidado AS
SELECT * FROM obter_relatorio_consolidado();

-- View: Resumo por Categoria
CREATE OR REPLACE VIEW vw_resumo_categoria AS
SELECT * FROM obter_resumo_categoria();

-- View: Performance dos Contadores
CREATE OR REPLACE VIEW vw_performance_contadores AS
SELECT * FROM obter_performance_contadores();

-- View: Produtos Mais Contados
CREATE OR REPLACE VIEW vw_top_produtos AS
SELECT * FROM obter_produtos_mais_contados(50);

-- View: Estatísticas
CREATE OR REPLACE VIEW vw_estatisticas_gerais AS
SELECT * FROM obter_estatisticas_gerais();


-- 10. EXEMPLO: CHAMAR TODAS AS FUNÇÕES
-- ============================================================================

/*
-- Relatório consolidado
SELECT * FROM obter_relatorio_consolidado();

-- Resumo por categoria
SELECT * FROM obter_resumo_categoria();

-- Performance dos contadores
SELECT * FROM obter_performance_contadores();

-- Produtos mais contados
SELECT * FROM obter_produtos_mais_contados(20);

-- Timeline de um usuário específico
SELECT * FROM obter_timeline_contagem('uid-do-usuario');

-- Estatísticas gerais
SELECT * FROM obter_estatisticas_gerais();

-- Comparação com SPED (após importar dados SPED)
SELECT * FROM comparar_contagem_com_sped();

-- Logs de auditoria
SELECT * FROM auditoria_master ORDER BY timestamp DESC LIMIT 100;

-- Registrar uma ação master
SELECT registrar_auditoria_master(
  'uid-admin'::UUID,
  'EXPORTAR_RELATORIO_CSV',
  jsonb_build_object('data', NOW(), 'itens', 500)
);
*/

-- ============================================================================
-- FIM DAS QUERIES
-- ============================================================================
