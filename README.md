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
2. Create `.env.local`:

   ```env
   VAULT_ENDPOINTS=http://localhost:8200,https://vault.example.com
   APP_TITLE="Vault Secret Checker"
   ```

3. Run development server: `npm run dev`
4. Open `http://localhost:3000`

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
