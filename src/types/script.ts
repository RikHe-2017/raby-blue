export interface Script {
  id: string
  name: string
  content: string
  groupId: string
  createdAt?: string
  updatedAt?: string
}

export interface ScriptGroup {
  id: string
  name: string
  scripts: Script[]
  parentId?: string
  children?: ScriptGroup[]
}

export interface ScriptConfig {
  enabled: boolean
  groups: ScriptGroup[]
}

export const DEFAULT_SCRIPT_CONFIG: ScriptConfig = {
  enabled: false,
  groups: []
}
