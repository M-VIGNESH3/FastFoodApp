# Implement ArgoCD + Argo Rollouts Blue-Green Deployment & CI Pipeline

## Background

The FastFoodApp is a microservices-based food delivery platform with 5 services (frontend, api-gateway, user-service, restaurant-service, order-service) + MongoDB. It currently has:
- **Helm Charts** in `release/` with standard `Deployment` resources
- **Basic CI Workflows** (`ci.yml`, `code-quality.yml`) that only lint/install a single service
- **Docker images** pushed to `vignesh8386/fastfoodapp-*` on DockerHub

**Goal**: Implement ArgoCD-based GitOps with Argo Rollouts Blue-Green deployment strategy and a proper CI pipeline, all on a **new branch** (`feature/argocd-bluegreen`).

---

## User Review Required

> [!IMPORTANT]
> **New branch**: All changes will be made on a new branch `feature/argocd-bluegreen` so you can compare with `main`.

> [!IMPORTANT]
> **ArgoCD Installation**: This plan creates the ArgoCD *Application* manifests and Argo Rollouts configurations. You'll still need to install ArgoCD and Argo Rollouts in your cluster:
> ```bash
> # Install ArgoCD
> kubectl create namespace argocd
> kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
> 
> # Install Argo Rollouts
> kubectl create namespace argo-rollouts
> kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
> ```

> [!WARNING]
> **GitHub Secrets Required**: The CI pipeline needs these secrets configured in your GitHub repo:
> - `DOCKERHUB_USERNAME` — Your DockerHub username
> - `DOCKERHUB_TOKEN` — Your DockerHub access token
> - `GIT_TOKEN` — A GitHub PAT with repo write access (for updating image tags in Helm values)

---

## Proposed Changes

### Component 1: Git Branch Setup

Create branch `feature/argocd-bluegreen` from `main` before making any changes.

---

### Component 2: Argo Rollouts — Blue-Green Deployment Templates

Convert the existing `Deployment` resources to `Rollout` resources for the 4 application services (frontend, api-gateway, user-service, restaurant-service, order-service). MongoDB stays as a regular Deployment since it's a stateful database.

Each service will get:
- A **Rollout** resource (replaces `Deployment`) with `blueGreenStrategy`
- An **active Service** (routes production traffic)
- A **preview Service** (routes to the new "green" version for testing)

#### [MODIFY] release/charts/api-gateway/templates/deployment.yaml → rollout.yaml
- Convert `Deployment` → `Rollout` (`argoproj.io/v1alpha1`)
- Add `strategy.blueGreen` with `activeService`, `previewService`, and `autoPromotionEnabled: false`

#### [NEW] release/charts/api-gateway/templates/preview-service.yaml
- New preview service pointing to the green (preview) pods

#### [MODIFY] release/charts/api-gateway/templates/service.yaml
- Add `rollouts-pod-template-hash` selector awareness (active service, no changes needed — Argo Rollouts injects selectors automatically)

*(Same pattern for `user-service`, `restaurant-service`, `order-service`, and `frontend`)*

---

### Component 3: ArgoCD Application Manifests

#### [NEW] argocd/ directory

Create ArgoCD Application CRDs that tell ArgoCD how to manage the app:

#### [NEW] argocd/namespace.yaml
- Namespace for the ArgoCD project

#### [NEW] argocd/project.yaml
- ArgoCD `AppProject` restricting sources and destinations

#### [NEW] argocd/application.yaml
- ArgoCD `Application` pointing to the `release/` Helm chart on the `feature/argocd-bluegreen` branch
- Auto-sync with self-heal and auto-prune enabled

#### [NEW] argocd/README.md
- Instructions for installing ArgoCD, Argo Rollouts, and applying the manifests

---

### Component 4: Updated Helm Values

#### [MODIFY] release/values.yaml
- Add `blueGreen.autoPromotionEnabled` toggle per service
- Add `previewService` port configurations

---

### Component 5: CI/CD Pipeline

#### [NEW] .github/workflows/ci-cd.yml

A comprehensive, production-grade CI/CD pipeline that:

1. **Triggers on**: push to `feature/argocd-bluegreen` and `main` branches
2. **Build Matrix**: Builds all 5 services in parallel using a matrix strategy
3. **Steps per service**:
   - Checkout code
   - Setup Node.js & install dependencies
   - Run linting (StandardJS)
   - Docker build
   - Trivy vulnerability scan on the image
   - Login to DockerHub & push image with tags: `${{ github.sha }}` and `latest`
4. **Update Helm Values** (post-build job):
   - Automatically updates `release/values.yaml` with the new image tag (`github.sha`)
   - Commits and pushes the change → ArgoCD detects the git change and syncs

This is the **GitOps loop**: Code push → CI builds image → CI updates Helm values → ArgoCD syncs → Argo Rollouts performs blue-green deploy.

---

### Component 6: Argo Rollouts Dashboard

#### [NEW] argocd/rollouts-dashboard.yaml
- A `Service` to expose the Argo Rollouts dashboard UI so you can visually monitor blue-green deployments and promote/rollback

---

## Architecture Diagram

```
┌──────────────┐    push     ┌──────────────────────┐
│  Developer   │────────────▶│   GitHub Repository  │
└──────────────┘             │  (feature/argocd-    │
                             │   bluegreen branch)  │
                             └──────┬───────────────┘
                                    │
                           ┌────────▼────────┐
                           │  GitHub Actions  │
                           │    CI Pipeline   │
                           │ ┌──────────────┐ │
                           │ │ Lint & Test   │ │
                           │ │ Docker Build  │ │
                           │ │ Trivy Scan    │ │
                           │ │ Push to DHub  │ │
                           │ │ Update values │ │
                           │ └──────────────┘ │
                           └────────┬─────────┘
                                    │ updates image tag
                           ┌────────▼─────────┐
                           │  ArgoCD watches   │
                           │  Git repo for     │
                           │  changes          │
                           └────────┬──────────┘
                                    │ syncs
                           ┌────────▼──────────────┐
                           │  Kubernetes Cluster    │
                           │  ┌──────────────────┐  │
                           │  │  Argo Rollouts    │  │
                           │  │  Blue ──▶ Green   │  │
                           │  │  (active) (preview)│  │
                           │  └──────────────────┘  │
                           └────────────────────────┘
```

---

## File Summary

| # | Action | Path | Description |
|---|--------|------|-------------|
| 1 | NEW | `argocd/namespace.yaml` | FastFood namespace |
| 2 | NEW | `argocd/project.yaml` | ArgoCD AppProject |
| 3 | NEW | `argocd/application.yaml` | ArgoCD Application for Helm chart |
| 4 | NEW | `argocd/rollouts-dashboard.yaml` | Argo Rollouts dashboard service |
| 5 | NEW | `argocd/README.md` | Setup instructions |
| 6 | MODIFY | `release/values.yaml` | Add blue-green config values |
| 7 | REPLACE | `release/charts/api-gateway/templates/deployment.yaml` → `rollout.yaml` | Rollout resource |
| 8 | NEW | `release/charts/api-gateway/templates/preview-service.yaml` | Preview service |
| 9 | REPLACE | `release/charts/user-service/templates/deployment.yaml` → `rollout.yaml` | Rollout resource |
| 10 | NEW | `release/charts/user-service/templates/preview-service.yaml` | Preview service |
| 11 | REPLACE | `release/charts/restaurant-service/templates/deployment.yaml` → `rollout.yaml` | Rollout resource |
| 12 | NEW | `release/charts/restaurant-service/templates/preview-service.yaml` | Preview service |
| 13 | REPLACE | `release/charts/order-service/templates/deployment.yaml` → `rollout.yaml` | Rollout resource |
| 14 | NEW | `release/charts/order-service/templates/preview-service.yaml` | Preview service |
| 15 | REPLACE | `release/charts/frontend/templates/deployment.yaml` → `rollout.yaml` | Rollout resource |
| 16 | NEW | `release/charts/frontend/templates/preview-service.yaml` | Preview service |
| 17 | NEW | `.github/workflows/ci-cd.yml` | Full CI/CD pipeline |

---

## Open Questions

> [!IMPORTANT]
> **Auto-promotion**: Should the blue-green deployment **auto-promote** the green version to active after it passes readiness checks? Or do you want **manual promotion** (you confirm via `kubectl argo rollouts promote <service>` or the dashboard)?
> **Recommendation**: I'll default to `autoPromotionEnabled: false` (manual), which is safer for learning and production.

> [!IMPORTANT]
> **GitHub repo URL**: The ArgoCD Application manifest needs your GitHub repository URL. I'll use `https://github.com/M-VIGNESH3/FastFoodApp.git` based on your corpus name. Please confirm this is correct.

---

## Verification Plan

### Automated Tests
1. **Helm lint**: `helm lint release/` to validate all chart templates
2. **YAML validation**: Validate all ArgoCD manifests are well-formed
3. **CI workflow validation**: `actionlint` on the workflow YAML (if available)

### Manual Verification
1. Push the branch and verify GitHub Actions CI runs successfully
2. Install ArgoCD + Argo Rollouts in your cluster
3. Apply the ArgoCD manifests: `kubectl apply -f argocd/`
4. Verify ArgoCD syncs and deploys the app
5. Trigger a code change → watch the blue-green rollout in the Argo Rollouts dashboard
6. Manually promote or rollback the green deployment
