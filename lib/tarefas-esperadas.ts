// lib/tarefas-esperadas.ts
// Mapa de vínculos entre entidades (Grupo/Regime/Atividade) e nomes de tarefas
export interface MapaVinculosSetor {
  porGrupo: Record<string, string[]>
  porRegime: Record<string, string[]>
  porAtividade: Record<string, string[]>
}
