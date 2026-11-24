CREATE TABLE "resumo_academico_scientific_diagnoses" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'resumo',
    "analyzed_revision" INTEGER NOT NULL,
    "diagnosis" JSONB NOT NULL,
    "text_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resumo_academico_scientific_diagnoses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resumo_diag_project_revision_scope_key"
ON "resumo_academico_scientific_diagnoses"("project_id", "analyzed_revision", "scope");

CREATE INDEX "resumo_diag_project_created_idx"
ON "resumo_academico_scientific_diagnoses"("project_id", "created_at");

CREATE INDEX "resumo_diag_project_revision_idx"
ON "resumo_academico_scientific_diagnoses"("project_id", "analyzed_revision");

ALTER TABLE "resumo_academico_scientific_diagnoses"
ADD CONSTRAINT "resumo_academico_scientific_diagnoses_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resumo_academico_scientific_diagnoses"
ADD CONSTRAINT "resumo_academico_scientific_diagnoses_profile_id_fkey"
FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "resumo_academico_scientific_diagnoses"
ADD CONSTRAINT "resumo_academico_scientific_diagnoses_text_version_id_fkey"
FOREIGN KEY ("text_version_id") REFERENCES "resumo_academico_text_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
