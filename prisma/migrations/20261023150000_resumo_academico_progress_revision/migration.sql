-- Adiciona o contador de revisão para controle otimista de concorrência.
-- O DEFAULT preserva os registros legados com revisão inicial zero.
ALTER TABLE "resumo_academico_progress"
ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
