# ArgoCD + Argo Rollouts Setup Guide

## 🎯 Overview

This directory contains the ArgoCD manifests for managing the FastFoodApp using **GitOps** with **Blue-Green Deployment** strategy via Argo Rollouts.

### Architecture

```
GitHub Repo (source of truth)
       │
       ▼
   ArgoCD (watches for changes)
       │
       ▼
   Kubernetes Cluster
       │
       ▼
   Argo Rollouts (manages blue-green deployments)
       │
       ├── Active Service  (BLUE - serves live traffic)
       └── Preview Service (GREEN - new version for testing)
```

---

## 📋 Prerequisites

- A running Kubernetes cluster (Minikube, EKS, GKE, AKS, etc.)
- `kubectl` configured and connected to your cluster
- `helm` v3+ installed

---

## 🚀 Step 1: Install ArgoCD

```bash
# Create the ArgoCD namespace
kubectl create namespace argocd

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD to be ready
kubectl wait --for=condition=available --timeout=300s deployment/argocd-server -n argocd

# Get the initial admin password
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d

# Port-forward to access the ArgoCD UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Open: https://localhost:8080
# Username: admin | Password: (from above)
```

---

## 🔄 Step 2: Install Argo Rollouts

```bash
# Create the Argo Rollouts namespace
kubectl create namespace argo-rollouts

# Install Argo Rollouts Controller
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml

# Wait for the controller to be ready
kubectl wait --for=condition=available --timeout=300s deployment/argo-rollouts -n argo-rollouts

# (Optional) Install the kubectl rollouts plugin for CLI management
# Visit: https://argoproj.github.io/argo-rollouts/installation/#kubectl-plugin-installation
```

---

## 📦 Step 3: Deploy the ArgoCD Application

```bash
# Apply all ArgoCD manifests in order
kubectl apply -f argocd/namespace.yaml
kubectl apply -f argocd/project.yaml
kubectl apply -f argocd/application.yaml

# (Optional) Deploy the Argo Rollouts Dashboard
kubectl apply -f argocd/rollouts-dashboard.yaml
```

---

## 🖥️ Step 4: Access the Dashboards

### ArgoCD Dashboard
```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Open: https://localhost:8080
```

### Argo Rollouts Dashboard
```bash
kubectl argo rollouts dashboard -n fastfood
# Or if using the service:
kubectl port-forward svc/argo-rollouts-dashboard -n argo-rollouts 3100:3100
# Open: http://localhost:3100
```

---

## 🟢🔵 Blue-Green Deployment Workflow

### How it works:

1. **You push code** to the `feature/argocd-bluegreen` branch
2. **GitHub Actions CI** builds Docker images and updates `release/values.yaml` with the new image tag
3. **ArgoCD detects** the change in Git and syncs the cluster
4. **Argo Rollouts** creates a new ReplicaSet (GREEN) alongside the existing one (BLUE)
5. The **Preview Service** routes to the GREEN version for testing
6. The **Active Service** still routes to the BLUE version (production traffic)
7. **You manually promote** when satisfied: `kubectl argo rollouts promote <service-name> -n fastfood`
8. Traffic switches to GREEN, and BLUE is scaled down

### Useful Commands:

```bash
# Watch the rollout status in real-time
kubectl argo rollouts get rollout api-gateway -n fastfood --watch

# Promote the green deployment to active
kubectl argo rollouts promote api-gateway -n fastfood

# Abort a rollout (rollback to blue)
kubectl argo rollouts abort api-gateway -n fastfood

# Undo a rollout (revert to previous version)
kubectl argo rollouts undo api-gateway -n fastfood

# List all rollouts
kubectl argo rollouts list rollouts -n fastfood
```

---

## 📁 Files in this Directory

| File | Description |
|------|-------------|
| `namespace.yaml` | Creates the `fastfood` namespace |
| `project.yaml` | ArgoCD AppProject (security boundary) |
| `application.yaml` | ArgoCD Application (GitOps config) |
| `rollouts-dashboard.yaml` | Argo Rollouts Dashboard Service |
| `README.md` | This setup guide |

---

## 🔐 GitHub Secrets Required

For the CI pipeline to work, configure these in your GitHub repo settings:

| Secret | Description |
|--------|-------------|
| `DOCKERHUB_USERNAME` | Your DockerHub username |
| `DOCKERHUB_TOKEN` | Your DockerHub access token |
| `GIT_TOKEN` | GitHub PAT with repo write access |
