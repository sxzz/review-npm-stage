export type JsonRecord = Record<string, any>

export interface StageRecord {
  id: string
  packageName: string
  version: string
  tag: string | null
  createdAt: string | null
  actor: unknown
  actorType: unknown
  shasum: string | null
}

export interface WorkspaceProject {
  name: string | null
  version: string | null
  path: string
  private: boolean
}

export interface WorkspaceInfo {
  root: string
  all: WorkspaceProject[]
  candidates: WorkspaceProject[]
  warnings: string[]
}

export type CollectMode =
  | { kind: 'package'; target: { name: string; version: string } }
  | { kind: 'workspace'; workspace: WorkspaceInfo }

export interface CollectOptions {
  pnpmFilters: string[]
  timeout: number
  interval: number
  workspaceRoot: string | null
  registry: string | null
  outputDir: string | null
}

export interface ApproveOptions {
  reviewDir: string | null
  verdict: string | null
  manualConfirmed: boolean
}

export interface CleanupOptions {
  reviewDir: string | null
}

export interface FileInventoryItem {
  path: string
  size: number
  mode: number
}

export type FileInventory = Map<string, FileInventoryItem>

export interface PackageReview {
  key: string
  packageDir: string
  stage: StageRecord
  baseline: JsonRecord
  staged: JsonRecord
  targetManifest: JsonRecord
  baselineManifest: JsonRecord
  artifacts: JsonRecord
  patch: JsonRecord
  fileChanges: JsonRecord
  dependencyDelta: JsonRecord
  dependencyReview: JsonRecord | null
  automaticApprovalBlockers: string[]
}
