-- Estrutura aditiva para snapshots textuais do Resumo Acadêmico.
-- Nenhuma captura é ativada por esta migration.

CREATE TYPE "ResumoAcademicoTextOrigin" AS ENUM (
    'ia_assistida',
    'pesquisador',
    'restauracao'
);

CREATE TABLE "resumo_academico_text_versions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "section" "ResumoAcademicoSection",
    "version_number" INTEGER NOT NULL,
    "progress_revision" INTEGER NOT NULL,
    "origin" "ResumoAcademicoTextOrigin" NOT NULL,
    "content" TEXT NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "previous_version_id" TEXT,
    "source_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resumo_academico_text_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resumo_academico_text_versions_project_id_scope_key_version_number_key"
ON "resumo_academico_text_versions"("project_id", "scope_key", "version_number");

CREATE UNIQUE INDEX "resumo_academico_text_versions_source_event_id_key"
ON "resumo_academico_text_versions"("source_event_id");

CREATE INDEX "resumo_academico_text_versions_project_id_scope_key_created_at_idx"
ON "resumo_academico_text_versions"("project_id", "scope_key", "created_at");

CREATE INDEX "resumo_academico_text_versions_project_id_progress_revision_idx"
ON "resumo_academico_text_versions"("project_id", "progress_revision");

ALTER TABLE "resumo_academico_text_versions"
ADD CONSTRAINT "resumo_academico_text_versions_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resumo_academico_text_versions"
ADD CONSTRAINT "resumo_academico_text_versions_previous_version_id_fkey"
FOREIGN KEY ("previous_version_id") REFERENCES "resumo_academico_text_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "resumo_academico_text_versions"
ADD CONSTRAINT "resumo_academico_text_versions_source_event_id_fkey"
FOREIGN KEY ("source_event_id") REFERENCES "resumo_academico_history_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
