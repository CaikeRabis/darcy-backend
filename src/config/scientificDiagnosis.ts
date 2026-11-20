/** Feature flag server-side: ausência da variável mantém o endpoint desabilitado. */
export function isScientificDiagnosisEnabled(
  environmentVariables: NodeJS.ProcessEnv = process.env,
): boolean {
  return environmentVariables.DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED?.trim().toLowerCase() === 'enabled'
}
