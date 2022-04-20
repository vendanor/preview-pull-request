export const PREVIEW_TAG_PREFIX = '-preview';

export type Command = 'deploy' | 'remove' | 'notify';

export interface Options {
  wait: string;
  TlsSecretName: string;
  helmValues: string;
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
  // cmd: Command | string;
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

type OptionKeys = keyof Options;

const optionsDict: { [key in OptionKeys]: string } = {
  appName: 'app-name',
  helmRepoPassword: 'helm-repo-password',
  helmRepoUsername: 'helm-repo-username',
  helmRepoUrl: 'helm-repo-url',
  TlsSecretName: 'tls-secret-name',
  clusterIssuer: 'cluster-issuer',
  helmKeyClusterIssuer: 'helm-key-cluster-issuer',
  helmKeyTlsSecretName: 'helm-key-tls-secret-name',
  helmRemovePreviewCharts: 'helm-preview-charts',
  helmKeyUrl: 'helm-key-url',
  helmKeyNamespace: 'helm-key-namespace',
  helmKeyImage: 'helm-key-image',
  helmKeyContainerSuffix: 'helm-key-container-suffix',
  helmChartFilePath: 'helm-chart',
  githubToken: 'token',
  baseUrl: 'base-url',
  dockerPullSecret: 'docker-pull-secret',
  helmNamespace: 'helm-namespace',
  dockerTagMajor: 'docker-tag-major',
  helmOrganization: 'helm-organization',
  helmTagMajor: 'helm-tag-major',
  dockerPassword: 'docker-password',
  dockerUsername: 'docker-username',
  dockerRegistry: 'docker-registry',
  dockerOrganization: 'docker-organization',
  dockerImageName: 'docker-image-name',
  dockerFile: 'docker-file',
  hashSalt: 'hash-salt',
  helmKeyAppName: 'helm-key-app-name',
  helmKeyPullSecret: 'helm-key-pullsecret',
  helmValues: 'helm-values',
  wait: 'wait'
};

export function validateOptions(options: Options) {
  const errorMessages: Array<string> = [];
  const requiredOptions: Array<keyof Options> = [
    'appName',
    'dockerUsername',
    'dockerPassword',
    'dockerRegistry',
    'dockerOrganization',
    'githubToken',
    'dockerTagMajor',
    'helmTagMajor',
    'helmChartFilePath',
    'hashSalt'
  ];
  requiredOptions.forEach(value => {
    if (options[value] === undefined) {
      errorMessages.push(`Option ${optionsDict[value]} is required`);
    } else if (
      typeof options[value] === 'string' &&
      options[value]?.length === 0
    ) {
      errorMessages.push(`Option ${optionsDict[value]} is required`);
    }
  });
  if (errorMessages.length) {
    throw new Error(errorMessages.join('\n'));
  }
}

export const stickyHeaderKey = 'VnKubePreview';
export const stickyEnabledPreviewKey = 'VnEnablePreview';
export function headerPreviewEnabled(enable: boolean) {
  return `<!-- ${stickyEnabledPreviewKey}:${enable} -->`;
}
export function headerStickyComment(header: string) {
  return `<!-- Sticky Pull Request Comment:${header} -->`;
}
