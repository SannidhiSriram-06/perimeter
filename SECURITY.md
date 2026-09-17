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
   - 5-digit credentials designate administrative access (full cluster visibility and directory control).
   - 6-digit credentials enforce scoped visibility restricted strictly to the user's assigned team and services.
   - Authentication failures return uniform, generic errors to mitigate user enumeration.
