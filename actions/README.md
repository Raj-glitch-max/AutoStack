# AutoStack GitHub Actions

Official GitHub Actions for deploying to AutoStack.

## Actions

### 🚀 Deploy (`autostack/actions/deploy@v1`)

Deploy your application to AutoStack.

```yaml
- uses: autostack/actions/deploy@v1
  with:
    token: ${{ secrets.AUTOSTACK_TOKEN }}
    environment: production
    wait: 'true'
    timeout: '15'
```

**Inputs:**
- `token` (required): AutoStack API token
- `environment` (required): Target environment name
- `wait` (optional): Wait for deployment to complete (default: `true`)
- `timeout` (optional): Maximum wait time in minutes (default: `15`)

**Outputs:**
- `live_url`: The live URL of the deployed application
- `deployment_id`: The AutoStack deployment ID
- `duration_seconds`: Time taken for deployment
- `estimated_monthly_cost`: Estimated monthly cost

### 🔄 Rollback (`autostack/actions/rollback@v1`)

Rollback to a previous deployment.

```yaml
- uses: autostack/actions/rollback@v1
  with:
    token: ${{ secrets.AUTOSTACK_TOKEN }}
    environment: production
    to: abc1234  # optional: specific commit SHA
```

**Inputs:**
- `token` (required): AutoStack API token
- `environment` (required): Target environment name
- `to` (optional): Specific commit SHA to roll back to

**Outputs:**
- `rolled_back_to`: Commit SHA rolled back to
- `previous_deployment_id`: The deployment ID rolled back to

### 👁️ Preview (`autostack/actions/preview@v1`)

Create preview environments for pull requests.

```yaml
- uses: autostack/actions/preview@v1
  with:
    token: ${{ secrets.AUTOSTACK_TOKEN }}
    staging_environment: staging
```

**Inputs:**
- `token` (required): AutoStack API token
- `staging_environment` (required): Base staging environment

**Outputs:**
- `preview_url`: The live URL of the preview environment
- `deployment_id`: The AutoStack deployment ID

## Example Workflows

### Deploy on Push to Main

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: autostack/actions/deploy@v1
        id: deploy
        with:
          token: ${{ secrets.AUTOSTACK_TOKEN }}
          environment: production
          timeout: '20'

      - name: Run smoke tests
        run: curl -f ${{ steps.deploy.outputs.live_url }}/health

      - name: Rollback if smoke tests fail
        if: failure()
        uses: autostack/actions/rollback@v1
        with:
          token: ${{ secrets.AUTOSTACK_TOKEN }}
          environment: production
```

### PR Preview Environments

```yaml
# .github/workflows/preview.yml
name: Preview
on:
  pull_request:
    types: [opened, synchronize, reopened, closed]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: autostack/actions/preview@v1
        with:
          token: ${{ secrets.AUTOSTACK_TOKEN }}
          staging_environment: staging
```

### Multi-Environment Promotion

```yaml
# .github/workflows/promote.yml
name: Promote
on:
  workflow_dispatch:
    inputs:
      target:
        type: choice
        options: [staging, production]

jobs:
  promote:
    runs-on: ubuntu-latest
    environment: ${{ inputs.target }}
    steps:
      - uses: autostack/actions/deploy@v1
        with:
          token: ${{ secrets.AUTOSTACK_TOKEN }}
          environment: ${{ inputs.target }}
```

## Setup

1. Get your AutoStack API token from the dashboard
2. Add it as a repository secret: `AUTOSTACK_TOKEN`
3. Create a workflow file using the examples above

## Building

Each action needs to be built before use:

```bash
cd actions/deploy
npm install
npm run build

cd ../rollback
npm install
npm run build

cd ../preview
npm install
npm run build
```

The compiled `dist/index.js` files are checked into the repository (GitHub Actions requirement).

## License

MIT
