# Vault Secret Checker

🌐 **Live Demo**: [https://vault-secret-checker.vercel.app/](https://vault-secret-checker.vercel.app/)

In production environments, Vault secret IDs require periodic updates, but developers cannot access production systems directly. This tool enables quick validation that new Secret Keys can correctly replace existing ones without requiring direct production access. All production changes must go through change management systems.

## Features

- Web interface for Vault secret validation
- AppRole authentication and token management
- Secret path permission testing
- Token wrapping/unwrapping support
- Kubernetes integration for secret retrieval
- Email notifications for operations
- Helm chart deployment

## Quick Start

1. Install dependencies: `npm install`
2. Start a local Vault dev instance in Kubernetes:

   ```bash
   helm repo add hashicorp https://helm.releases.hashicorp.com
   helm repo update

   helm install vault hashicorp/vault \
     --set "server.dev.enabled=true" \
     --set "server.dev.devRootToken=dev-only-token"
   ```

3. Create AppRole test data and the `vault-credentials` Kubernetes secret:

   ```bash
   bash ci/scripts/setup-and-validate-vault.sh
   ```

4. Forward Vault to localhost:

   ```bash
   kubectl port-forward svc/vault 8200:8200
   ```

5. Start a local SMTP debug server:

   ```bash
   python3 -m smtpd -c DebuggingServer -n localhost:1025
   ```

6. Create `.env.local`:

   ```env
   VAULT_ENDPOINTS=http://localhost:8200
   APP_TITLE="Vault Secret Checker"
   K8S_NAMESPACES=default
   VAULT_V1_GENERATE_SECRET_ID=
   SMTP_HOST=localhost
   SMTP_PORT=1025
   SMTP_FROM_EMAIL=noreply@example.com
   SMTP_ADMIN_CC_WITH=
   ```

7. Run development server: `npm run dev`
8. Open `http://localhost:3000`

### Local Dev Credentials

After running `ci/scripts/setup-and-validate-vault.sh`, the Kubernetes secret `vault-credentials` contains the AppRole credentials used by the app:

```bash
kubectl get secret vault-credentials -o json | jq .data
```

Use:

- `role-id` as the UI `Role ID`
- `default` as the namespace
- `vault-credentials` as the secret name
- `secret-id` as the secret key

## Usage

1. Select Vault endpoint
2. Configure AppRole authentication (Role ID + Kubernetes secret reference)
3. Login to obtain Vault token
4. Test secret path permissions
5. Manage tokens (lookup/revoke)

### Token Wrapping

1. Enter wrapped token
2. Optional email notifications
3. Unwrap to retrieve response

## Configuration

### Environment Variables

- `VAULT_ENDPOINTS`: Comma-separated Vault endpoints
- `APP_TITLE`: Application title
- `K8S_NAMESPACES`: Available Kubernetes namespaces
- `VAULT_V1_GENERATE_SECRET_ID`: Optional path template override for Secret ID generation. Leave empty to use Vault native `/v1/auth/approle/role/{approle}/secret-id`; set it to something like `/v1/orchestrator/generate-secret-id/{approle}` to override.
- `SMTP_ADMIN_CC_WITH`: Optional comma/space separated email list that will always be added as CC on outgoing emails
- `EMAIL_*`: Email configuration

### Kubernetes Secret Example

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: vault-approle
  namespace: default
data:
  secret-id: <base64-encoded-secret-id>
```

## Deployment

### Using Docker Image from GitHub Container Registry

```bash
# Pull the image from GitHub Container Registry
docker pull ghcr.io/username/vault-secret-checker:latest

# Run the container
docker run -p 3000:3000 \
  -e VAULT_ENDPOINTS=http://vault:8200 \
  ghcr.io/username/vault-secret-checker:latest
```

**Note**: Replace `username` with the actual GitHub username/organization.

### Building Locally

```bash
# Build the image
docker build -t vault-secret-checker .

# Run the container
docker run -p 3000:3000 \
  -e VAULT_ENDPOINTS=http://vault:8200 \
  vault-secret-checker
```

### Kubernetes with Helm

```bash
helm install vault-secret-checker ./helm-chart/vault-secret-checker \
  --set config.vaultEndpoints="http://vault:8200" \
  --set config.appTitle="My Vault Checker"
```

## License

Private and proprietary.

## Contributing

For development setup and contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).
