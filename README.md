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
   `pullsecret`, `host`, `cluster-issuer`, `tls-secret-name` is defined
with values that can be overridden. This action will generate values per Pull Request
and set these when packaging the helm chart.
1. Create a GitHub action script `preview.yml` to integrate `preview-pull-request`

### 1. Define Helm chart

Example `values.yaml` in Helm chart:
```yaml
# Default values for myapp.
appname: myapp
namespace: myapp-ns
image: ghcr.io/company/myapp:latest
host: myapp.company.com
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
        - {{ .Values.host }}
      secretName: {{ .Values.tlsSecretName }}
  rules:
    - host: {{ .Values.host }}
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
  APP_NAME: 'my-app'

jobs:
  use:
    name: Use preview
    if: ${{ github.event.issue.pull_request || github.event.pull_request }}
    runs-on: ubuntu-latest
    permissions: write-all
    steps:
      - name: Probe preview
        id: preview_info
        uses: vendanor/preview-pull-request@v3
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          probe: true

      - name: Checkout
        if: ${{ steps.preview_info.outputs.isAddPreviewPending == 'true' }}
        uses:
          actions/checkout@v3
        with:
          ref: ${{ steps.preview_info.outputs.headRef }}

      - name: Manage preview
        uses: vendanor/preview-pull-request@v3
        with:
          app-name: ${{ env.APP_NAME }}
          token: ${{ secrets.GITHUB_TOKEN }}
          docker-username: ${{ github.actor }}
          docker-password: ${{ secrets.GITHUB_TOKEN }}
          docker-image-name: ${{ env.APP_NAME }}
          docker-pullsecret: ${{ secrets.VENDANOR_GH_PACKAGES_PULLSECRET }}
          helm-repo-password: ${{ secrets.VENDANOR_HELM_CHART_PASSWORD }}
          helm-values: |
            appconfig=${{secrets.CONFIG}}
```

## Certificates
You can use `preview-pull-request` with a unique certificate per preview, 
or a shared wildcard certificate. 

### Unique certificates
When deploying previews, set `clusterIssuer` to an issuer with support for resolving HTTP01 challenges.
Set `tlsSecretName` to a dynamic value to get a unique certificate for each PR.

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
