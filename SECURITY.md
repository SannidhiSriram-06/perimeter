# Security Policy

## Supported Versions

We actively support and provide security patches for the following versions of Perimeter:

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x (Development) | :white_check_mark: |
| < 0.1.0 | :x:                |

---

## Reporting a Vulnerability

The Perimeter team takes security and telemetry isolation seriously. If you discover a security vulnerability, please give us an opportunity to fix it before disclosing it publicly.

### How to Report
- **Email**: Send vulnerability reports directly to [sannidhisriram8@gmail.com](mailto:sannidhisriram8@gmail.com).
- **Subject Line**: `[SECURITY VULNERABILITY] Perimeter - <Brief Description>`
- Please include:
  - Description of the issue and potential impact
  - Step-by-step reproduction steps or proof-of-concept (PoC)
  - Affected components (e.g., Correlation Engine, IAM Service, BFF, Dashboard)

### What to Expect
- **Initial Response**: We will acknowledge receipt of your report within 48 hours.
- **Triage & Assessment**: We will validate the issue and coordinate a fix.
- **Disclosure**: Once a remediation is tested and merged, we will credit you (if desired) in the release notes.

---

## Security Architecture & Best Practices

Perimeter is designed for data-sovereign environments (BFSI, government, healthcare). When deploying:

1. **Telemetry Isolation**: Perimeter runs entirely inside your private VPC/Kubernetes cluster. Ensure network policies restrict egress to external endpoints unless configured with an external LLM key.
2. **Secrets Management**: Never commit API keys, database credentials, or Vault tokens into Git. Use Kubernetes Secrets or HashiCorp Vault.
3. **IAM Role Gating**:
   - Login takes an ID and a password. Passwords are stored as salted scrypt hashes and compared in constant time; a dummy hash is checked for unknown IDs so timing does not reveal valid IDs.
   - 5-digit IDs are administrators (full visibility and directory control). 6-digit IDs are team members, limited to incidents on services their team owns. The ID length is only a hint: the role is read from the database on every request (cached for 30 seconds) and never trusted from the token.
   - Authentication failures return one generic 401. Tokens are HMAC-signed and expire after 8 hours.
   - The alert webhook accepts only `Authorization: Bearer <WEBHOOK_SECRET>`, compared in constant time.
   - Rate limits per IP: 10 failed logins and 600 API requests per 15 minutes (counted per process).
4. **LLM boundary**: the only data sent outside the cluster is a compressed context (service names, trace edges and short evidence records) to the configured model provider. Model output is never trusted: a validator checks every claim against the evidence and the dashboard shows text built from the checked fields.

## Known limitations (see [docs/audit-report.md](docs/audit-report.md))

- `deploy/db/init.sql` seeds demo users that all share the public password `perimeter-dev`. Never load it into a shared or production database.
- The correlation engine API has no authentication and does not cap request size; keep it on an internal network. `/draft` spends the model quota of whoever can reach it.
- Tokens cannot be revoked before they expire, and rate-limit counters are per process.
- The BFF sets no security headers and sends `X-Powered-By: Express`.
- Container images have not been scanned for vulnerabilities; Python and npm dependencies are audited in CI.
