export type Command = 'deploy' | 'remove';

export interface Options {
  TlsSecretName: string;
  clusterIssuer: string;
  helmKeyNamespace: string;
  helmRemovePreviewCharts: string;
  helmKeyAppName: string;
  helmKeyImage: string;
  helmKeyPullSecret: string;
  helmKeyUrl: string;
  helmKeyContainerSuffix: string;
  helmKeyClusterIssuer: string;
  helmKeyTlsSecretName: string;
  helmRepoUsername: string;
  helmRepoPassword: string;
  baseUrl: string;
  dockerPullSecret: string;
  helmOrganization: string;
  helmRepoUrl?: string;
  helmChartFilePath: string;
  helmTagMajor: string;
  dockerPassword: string;
  dockerUsername: string;
  dockerFile: string;
  dockerTagMajor: string;
  dockerOrganization: string;
  dockerRegistry: string;
  dockerImageName: string;
  hashSalt: string;
  githubToken: string;
  helmNamespace: string;
  appName: string;
  cmd: Command | string;
}

export interface CommandResult {
  success: boolean;
  previewUrl?: string;
  helmReleaseName?: string;
  dockerImageVersion?: string;
}

export interface HelmReleaseInfo {
  name: string;
  namespace: string;
  revision: string;
  updated: string;
  status: string;
  chart: string;
  app_version: string;
}

export type HelmListResult = Array<HelmReleaseInfo>;

export interface ChartInfo {
  name: string;
  version: string;
  description: string;
  apiVersion: string;
  appVersion: string;
  type: string;
  created: string;
  digest: string;
}

export type ChartListResult = Array<ChartInfo>;

export interface Repo {
  owner: string;
  repo: string;
}
