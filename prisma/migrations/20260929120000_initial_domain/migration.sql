-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('artigo', 'dissertacao', 'tese', 'tcc', 'projeto-pesquisa', 'resumo-academico');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "profile_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "type" "ProjectType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resumo_academico_progress" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "progress" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resumo_academico_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_profile_id_idx" ON "projects"("profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "resumo_academico_progress_project_id_key" ON "resumo_academico_progress"("project_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resumo_academico_progress" ADD CONSTRAINT "resumo_academico_progress_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
