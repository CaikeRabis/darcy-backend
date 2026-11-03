-- C04: registra restaurações como eventos explícitos de domínio.
ALTER TYPE "ResumoAcademicoEventType" ADD VALUE IF NOT EXISTS 'restauracao';
