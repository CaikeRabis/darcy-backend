-- CreateEnum
CREATE TYPE "ResumoAcademicoEventType" AS ENUM (
    'rascunho_gerado',
    'rascunho_regenerado',
    'secao_aprovada',
    'decisao_autoral_alterada',
    'classificacao_cientifica_alterada',
    'resumo_consolidado'
);

-- CreateEnum
CREATE TYPE "ResumoAcademicoEventActor" AS ENUM ('pesquisador', 'darcy', 'sistema');

-- CreateEnum
CREATE TYPE "ResumoAcademicoSection" AS ENUM (
    'contexto',
    'objetivo',
    'metodologia',
    'fundamentacao_teorica',
    'resultados'
);

-- CreateTable
CREATE TABLE "resumo_academico_history_events" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "type" "ResumoAcademicoEventType" NOT NULL,
    "actor" "ResumoAcademicoEventActor" NOT NULL,
    "section" "ResumoAcademicoSection",
    "summary" TEXT NOT NULL,
    "content_version_ref" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resumo_academico_history_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resumo_academico_history_events_project_id_sequence_key"
ON "resumo_academico_history_events"("project_id", "sequence");

-- CreateIndex
CREATE INDEX "resumo_academico_history_events_project_id_created_at_idx"
ON "resumo_academico_history_events"("project_id", "created_at");

-- AddForeignKey
ALTER TABLE "resumo_academico_history_events"
ADD CONSTRAINT "resumo_academico_history_events_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
