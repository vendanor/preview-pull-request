# preview-pull-request
      
## Description
A Github Action to deploy previews of Pull Requests to Kubernetes using Helm charts 🚀

Deploy previews
 - build docker image + tag with meta preview tags
 - publish docker image to container registry
 - build helm chart + tag with meta tags
 - publish helm chart to chart repo (optional)
 - deploy chart / preview in Kubernetes
 - add a preview comment to pull request with link to preview
 - return preview url and other useful stuff

Remove previews when closing PR
- remove previews (Helm release) from Kubernetes
- remove Helm charts from chart repo (optional)

![illustration](illustration.png)

Example message in PR:
![comment](comment.png)

If you specify `helm-repo-url` when deploying, charts are also published to given helm chart repository.
This makes it possible to also deploy a specific chart/version to production, as a release candidate etc.
By default, preview charts are deleted from chart repository when PR is closed.
Set `helm-remove-preview-charts=false` if you want to keep them.

## Prerequisite
This action is (currently) tightly coupled to the following set of tools and conventions 
- Kubernetes
- ghcr.io as container registry (could work with others, but not tested)
- Docker containers
- Helm charts where values.yml follows a convention

## Usage
1. Define a Helm chart for your app where `appname`, `namespace`, `docker-image`, 
   `pullsecret`, `url`, `cluster-issuer`, `tls-secret-name` is defined
with values that can be overridden. This action will generate values per Pull Request
and set these when packaging the helm chart.
2. Create a GitHub action script `preview.yml` to integrate `preview-pull-request`

### 1. Define Helm chart

Example `values.yaml` in Helm chart:
```yaml
# Default values for myapp.
appname: myapp
namespace: myapp-ns
image: ghcr.io/company/myapp:latest
url: myapp.company.com
pullsecret: replace
containersuffix: production
clusterIssuer: my-cluster-issuer
tlsSecretName: myapp-cert
```

if your `values.yaml` file looks different, you can specify which keys to change when adding a preview.
If your `values.yaml` looks like this:
```yaml
docker:
  basic:
    dockerImage: ghcr.io/company/myapp:latest
```

set action input `helm-key-image=docker.basic.dockerImage` to set correct key when packaging Helm chart.

Example `ingress.yml` in Helm chart:  
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Values.appname }}
  namespace: {{ .Values.namespace }}
  annotations:
    cert-manager.io/cluster-issuer: {{ .Values.clusterIssuer }}
spec:
  tls:
    - hosts:
        - {{ .Values.url }}
      secretName: {{ .Values.tlsSecretName }}
  rules:
    - host: {{ .Values.url }}
      http:
        paths:
          - pathType: Prefix
            path: '/'
            backend:
              service:
                name: {{ .Values.appname }}
                port:
                  number: 80
```

Example `deployment.yml` in Helm chart:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Values.appname }}
  namespace: {{ .Values.namespace }}
  labels:
    app: {{ .Values.appname }}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: {{ .Values.appname }}
  template:
    metadata:
      labels:
        app: {{ .Values.appname }}
    spec:
      containers:
        - name: {{ .Values.appname }}{{ .Values.containersuffix }}
          image: {{ .Values.image }}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 80
            - containerPort: 443
```

### 3. Example GitHub Action script

```yaml
name: preview

on:
  issue_comment:
    types: [created, edited]
  pull_request:
    types: [opened, synchronize, closed, reopened]

env:
  DOCKER_FILE: 'Dockerfile'
  DOCKER_REGISTRY: 'ghcr.io'
  DOCKER_IMAGE_NAME: 'my-app'
  DOCKER_USERNAME: ${{github.actor}}
  DOCKER_PASSWORD: ${{ secrets.GITHUB_TOKEN }}
  DOCKER_PULLSECRET: ${{ secrets.PULLSECRET }}
  HELM_REPO_URL: 'https://yourhelmrepo.com'
  HELM_REPO_USER: ${{ secrets.HELM_CHART_USERNAME }}
  HELM_REPO_PASSWORD: ${{ secrets.HELM_CHART_PASSWORD }}
  HELM_CHART: 'charts/my-app'
  PREVIEW_APPNAME: 'my-app'
  PREVIEW_BASEURL: 'preview.company.com'
  PREVIEW_HASH_SECRET: ${{ secrets.PREVIEW_HASH_SEED }}
  KUBECONFIG_STAGING: ${{ secrets.KUBECONFIG }}

jobs:
  preview:
    name: Integrate preview
    runs-on: ubuntu-latest
    steps:
      - name: Read preview info
        id: preview_info
        uses: vendanor/preview-pull-request@v3.0
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          probe: true

      - name: Checkout
        if: ${{ steps.preview_info.outputs.isAddPreviewPending == 'true' }}
        uses: actions/checkout@v3

      - name: Cache dependencies
        if: ${{ steps.preview_info.outputs.isAddPreviewPending == 'true' }}
        uses: actions/cache@v3
        with:
          path: ~/.nuget/packages
          key: ${{ runner.os }}-nuget-${{ hashFiles('**/packages.lock.json') }}
          restore-keys: |
            ${{ runner.os }}-nuget-

      - name: Setup Dotnet
        if: ${{ steps.preview_info.outputs.isAddPreviewPending == 'true' }}
        uses: actions/setup-dotnet@v2
        with:
          dotnet-version: 6.x

      - name: Build Dotnet application
        if: ${{ steps.preview_info.outputs.isAddPreviewPending == 'true' }}
        run: |
          dotnet publish ${{ env.PROJECT_FILE }} \
          --configuration Release \
          --output deploy

      - name: Set Kubernetes context
        uses: azure/k8s-set-context@v2
        with:
          method: kubeconfig
          kubeconfig: ${{ env.KUBECONFIG_STAGING }}

      - name: Connect preview
        uses: vendanor/preview-pull-request@v3.0
        with:
          app-name: ${{ env.PREVIEW_APPNAME }}
          base-url: ${{ env.PREVIEW_BASEURL }}
          hash-salt: ${{ env.PREVIEW_HASH_SECRET }}
          token: ${{ secrets.GITHUB_TOKEN }}
          docker-registry: ${{ env.DOCKER_REGISTRY }}
          docker-username: ${{ env.DOCKER_USERNAME }}
          docker-password: ${{ env.DOCKER_PASSWORD }}
          docker-image-name: ${{ env.DOCKER_IMAGE_NAME }}
          docker-pullsecret: ${{ env.DOCKER_PULLSECRET }}
          docker-file: ${{ env.DOCKER_FILE }}
          helm-repo-url: ${{ env.HELM_REPO_URL }}
          helm-repo-user: ${{ env.HELM_REPO_USER }}
          helm-repo-password: ${{ env.HELM_REPO_PASSWORD }}
          helm-chart: ${{ env.HELM_CHART }}
          helm-values: |
            enabled=false
```

## Certificates
You can use `preview-pull-request` with a unique certificate per preview, 
or a shared wildcard certificate. 

### Unique certificates
When deploying previews, set `cluster-issuer` to an issuer with support for resolving HTTP01 challenges.
Set `tls-secret-name` to a dynamic value to get a unique certificate for each PR.

### Wildcard certificates
Add a ClusterIssuer which can resolve DNS01 challenges. Kubernetes cert-manager supports a few well known DNS services.
 [Here is an example](https://cert-manager.io/docs/configuration/acme/dns01/azuredns/) 
using letsencrypt, Azure DNS and DNS01 resolver (to enable issuing wildcard certs):

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: preview-issuer
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: mail@company.com
    privateKeySecretRef:
      name: letsencrypt-issuer-account-key
    solvers:
      - dns01:
          azureDNS:
            clientID: xxx
            clientSecretSecretRef:
              name: azuredns-config
              key: client-secret
            subscriptionID: xxx
            tenantID: xxx
            resourceGroupName: staging
            hostedZoneName: preview.company.com
            environment: AzurePublicCloud
      - http01:
          ingress:
            class: nginx

```

Then request a wildcard certificate:

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: cert-wild
  namespace: preview
spec:
  secretName: wild-cert
  issuerRef:
    name: preview-issuer
    kind: ClusterIssuer
  dnsNames:
    - "*.preview.company.com"
  duration: 2160h # 90d
  renewBefore: 360h # 15d
  subject:
    organizations:
      - company
```
