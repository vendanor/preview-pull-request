# VnKubePreview

## Description
A Github Action to deploy previews of Pull Requests to AKS - Azure Kubernetes Service using Helm charts 🚀

![illustration](https://github.com/vendanor/VnKubePreviewActions/blob/main/illustration.png?raw=true)

## Usage
1. Define a Helm chart for your app where `appname`, `namespace`, `docker-image`, `pullsecret` and `url` is defined
with values that can be overridden. VnKubePreviewAction will generate values per Pull Request
and set these when packaging the helm chart.
2. Set AKS context using `azure/k8s-set-context` in your ci/cd setup
3. Use VnKubePreviewAction to deploy and remove preview when opening or closing pull request.

Example setup:
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
        uses: vendanor/VnKubePreviewAction@v1.1 # check for latest version
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
          kubeconfig: ${{ env.KUBECONFIG_STAGING }}

      - name: Remove previews related to PR
        uses: vendanor/VnKubePreviewAction@v1.1 # check for latest version
        with:
          command: remove
          app-name: myapp
          token: ${{ secrets.GITHUB_TOKEN }}



```

