# preview-pull-request
      
## Description
A Github Action to deploy previews of Pull Requests to AKS - Azure Kubernetes Service using Helm charts 🚀

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
This action is (currently) tightly coupled to the following set of tools. 
- Kubernetes
- ghcr.io as container registry (could work with others, but not tested)
- Docker containers
- Helm charts

## Usage
1. Define a Helm chart for your app where `appname`, `namespace`, `docker-image`, 
   `pullsecret`, `url`, `cluster-issuer`, `tls-secret-name` is defined
with values that can be overridden. This action will generate values per Pull Request
and set these when packaging the helm chart.
2. Set AKS context using `azure/k8s-set-context`
3. Use `preview-pull-request` to deploy and remove previews when opening or closing pull request.

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

### 3. Example deployment:

```yaml
name: CI/CD Pull Request

on:
  pull_request:
    types: [opened, synchronize, closed]

jobs:
  add_preview:
    name: Build and deploy preview app
    if: github.event_name == 'pull_request' && github.event.action != 'closed'
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v2

      - name: Install packages
        run: npm ci

      - name: Build preview
        run: npm run build-preview

      - name: Set K8S context
        id: setcontext
        uses: azure/k8s-set-context@v1
        with:
          method: kubeconfig
          kubeconfig: ${{ secrets.KUBECONFIG_STAGING }}

      - name: Deploy app to VnKubePreview
        id: deploy_preview_step
        uses: vendanor/preview-pull-request@latest
        with:
          command: deploy
          app-name: myapp
          base-url: preview.domain.com
          hash-salt: saltandpepper
          token: ${{ secrets.GITHUB_TOKEN }}
          docker-registry: ghcr.io
          docker-username: ${{ github.repository_owner }}
          docker-password: ${{ secrets.GHCR_PASSWORD }}
          docker-image-name: my-app
          docker-pullsecret: ${{ secrets.PULLSECRET }}
          helm-chart: charts/myapp
          cluster-issuer: preview-issuer 
          tls-secret-name: cert-wild 

  remove_preview:
    name: Remove previews
    if: github.event_name == 'pull_request' && github.event.action == 'closed'
    runs-on: ubuntu-latest

    steps:
      - name: Set K8S context
        id: setcontext
        uses: azure/k8s-set-context@v1
        with:
          method: kubeconfig
          kubeconfig: ${{ env.KUBECONFIG }}

      - name: Remove previews related to PR
        uses: vendanor/preview-pull-request@latest
        with:
          command: remove
          app-name: myapp
          token: ${{ secrets.GITHUB_TOKEN }}
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

## Add build status message to sticky comment in PR

If you want a message in PR with build status use the following commands:
`notify-start`, `notify-cancelled`, `notify-failed`

```yaml
steps:
  - name: Notify preview build started
    uses: vendanor/preview-pull-request@v2.5-beta2
    with:
      command: notify-start
      app-name: ${{ env.PREVIEW_APPNAME }}
      base-url: ${{ env.PREVIEW_BASEURL }}
      hash-salt: ${{ env.PREVIEW_HASH_SECRET }}
      token: ${{ secrets.GITHUB_TOKEN }}          

  - name: Checkout
    uses: actions/checkout@v2

  - name: Build
    run: |
      build something

  - name: Set K8S context
    id: setcontext
    uses: azure/k8s-set-context@v1
    with:
      method: kubeconfig
      kubeconfig: ${{ env.KUBECONFIG_STAGING }}

  - name: Deploy preview
    id: deploy_preview_step
    uses: vendanor/preview-pull-request@v2.5
    with:
      command: deploy
      app-name: ${{ env.PREVIEW_APPNAME }}
      base-url: ${{ env.PREVIEW_BASEURL }}

  - name: Notify preview build cancelled
    uses: vendanor/preview-pull-request@v2.5
    if: cancelled()
    with:
      command: notify-cancelled
      app-name: ${{ env.PREVIEW_APPNAME }}
      base-url: ${{ env.PREVIEW_BASEURL }}
      hash-salt: ${{ env.PREVIEW_HASH_SECRET }}
      token: ${{ secrets.GITHUB_TOKEN }}

  - name: Notify preview build cancelled
    uses: vendanor/preview-pull-request@v2.5
    if: failure()
    with:
      command: notify-failed
      app-name: ${{ env.PREVIEW_APPNAME }}
      base-url: ${{ env.PREVIEW_BASEURL }}
      hash-salt: ${{ env.PREVIEW_HASH_SECRET }}
      token: ${{ secrets.GITHUB_TOKEN }}
```

