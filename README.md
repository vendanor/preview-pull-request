# VnKubePreview

## Description
A Github Action to deploy previews of Pull Requests to AKS - Azure Kubernetes Service using Helm charts 🚀

This action will:
 - build docker image + tag with meta preview tags
 - publish docker image to container registry
 - build helm chart + tag with meta tags
 - publish helm chart to chart repo (optional)
 - deploy chart / preview in Kubernetes
 - add a preview comment to pull request with link to preview
 - return preview url and other useful stuff

![illustration](illustration.png)

Example message in PR:
![comment](comment.png)


## Usage
1. Define a Helm chart for your app where `appname`, `namespace`, `docker-image`, 
   `pullsecret`, `url`, `cluster-issuer`, `tls-secret-name` is defined
with values that can be overridden. VnKubePreviewAction will generate values per Pull Request
and set these when packaging the helm chart.
2. Set AKS context using `azure/k8s-set-context` in your ci/cd setup
3. Use VnKubePreviewAction to deploy and remove previews when opening or closing pull request.

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
          kubeconfig: ${{ secrets.KUBECONFIG }}

      - name: Deploy app to VnKubePreview
        id: deploy_preview_step
        uses: vendanor/VnKubePreviewAction@latest
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
          cluster-issuer: my-preview-cluster-issuer # name of clusterissuer. If you want to use wildcard certificate, issuer needs to be able to resolve DNS challenges
          tls-secret-name: preview-wildcard-cert # shared wildcard cert name, or dynamic from appname

  remove_preview:
    name: Remove app previews from VnKubePreview
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
        uses: vendanor/VnKubePreviewAction@latest
        with:
          command: remove
          app-name: myapp
          token: ${{ secrets.GITHUB_TOKEN }}
```

## Certificates
This action only supports cert-manager ClusterIssuer for now. You can setup VnKubePreview using
unique certificates per preview, or a shared wildcard certificate. The latter is preferred
if you want to avoid letsencrypt's rate limits.

### Unique certificates
When deploying previews, set `cluster-issuer` to and issuer with support for resolving HTTP challenges.
Set `tls-secret-name` to a dynamic value to get a unique certificate for each PR.

### Wildcard certificates
Add a ClusterIssuer which can resolve DNS01 challenges. cert-manager supports a few well known DNS services.
 [Here is an example](https://cert-manager.io/docs/configuration/acme/dns01/azuredns/) 
using letsencrypt, Azure DNS and DNS01 resolver (to enable issuing wildcard certs):

```
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

## More info
If your `values.yaml` is different from example above, you can change which keys to set, see [action.yml](action.yml) for more info.

If you specify `helm-repo-url` when deploying, charts are also published to given helm chart repository.
This makes it possible to also deploy a specific chart/version to production, as a release candidate etc.

## Future improvements
- Update message in PR when starting build?
- Better way to pass custom values?

