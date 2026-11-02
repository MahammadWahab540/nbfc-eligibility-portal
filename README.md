# Centralised NBFC Eligibility Engine & Configuration Portal

This repository contains the complete, production-ready implementation of the **Centralised NBFC Eligibility Engine and Salesforce Integration Configuration Portal**, built to meet the specifications of the BRD and the BDA NBFC Lending Partners Master Data.

---

## 🌟 Key Features

1. **Decoupled Architecture**: Moves all eligibility logic, thresholds, and partner formulas out of Salesforce into a high-performance central microservice.
2. **Intuitive Low-Code Dashboard**: Business & risk operations users can:
   - View all 6 configured NBFC partners (Gyandhan, Fibe, Northern Arc, Auxilo, Techfino, Bajaj).
   - Adjust CIBIL cutoffs, monthly income barriers, max ages, and relationship whitelists.
   - Modify negative occupation lists and geographic restrictions (with city exceptions).
   - Toggle verification flags (PAN-Aadhaar linking, E-PAN availability, bank type, Name/DOB mismatches).
   - Reorder lender priorities (`Priority #1`, `Priority #2`, etc.) with 1-click controls.
   - Activate or deactivate lenders on demand.
3. **Interactive Rule Simulator & Playground**:
   - Pre-loaded with real inbound KYC JSON payloads.
   - Simulates the 4 Salesforce No-Cost EMI task parameter questions in real time.
   - Displays ranked eligible lenders with match scores and exact rejection reasons for ineligible ones.
   - Includes a simulated KYC customer dropdown and tamper-proof selection callback test.
4. **Execution Preferences**: Global settings for CIBIL range handling (Conservative / Optimistic / Midpoint) and Salesforce callback webhook URLs.
5. **Full Audit Trail**: Immutable change history tracking every criteria modification, priority shift, timestamp, and user.
6. **Live Evaluation Activity Monitor**: Real-time log of recent evaluation requests and suggestions.

---

## 📁 Repository Structure

```
nbfc_portel/
  ├── data/
  │    ├── rules.json             # Active NBFC rules & criteria specification
  │    ├── settings.json          # Global engine preferences & Salesforce webhook
  │    └── audit.json             # Immutable historical audit logs
  ├── public/
  │    ├── index.html             # Sleek frontend dashboard UI
  │    ├── styles.css             # Tailored styling & badge layouts
  │    └── app.js                 # Reactive frontend logic, simulator, & API client
  ├── engine.js                   # Pure rule evaluator & normalizer
  ├── server.js                   # HTTP REST API server & static file host
  ├── test-scenarios.js           # Comprehensive test suite covering business scenarios
  └── package.json                # Project configuration
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js (v18+ recommended; tested on v24)

### 1. Run the Server
From the project folder, execute:
```bash
node server.js
```

### 2. Open the Configuration Dashboard
Open your web browser and navigate to:
```
http://localhost:3000
```

### 3. Run Automated Business Tests
To verify all 11 parameter rules, regional exceptions (e.g. Guwahati in Assam), occupation blacklists, and mismatch edge cases:
```bash
node test-scenarios.js
```

---

## 🔌 API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Healthcheck and active partner summary |
| `GET` | `/api/v1/partners` | Retrieve all configured NBFC partners and rules |
| `PUT` | `/api/v1/partners/:id` | Update criteria for an NBFC (auto-increments version and logs audit) |
| `PATCH`| `/api/v1/partners/:id/status` | Activate or deactivate a partner |
| `POST`| `/api/v1/partners/reorder` | Update priority rank order |
| `POST`| `/api/v1/eligibility/evaluate` | Evaluate inbound KYC payload and return eligible NBFC suggestions |
| `POST`| `/api/v1/eligibility/:id/select`| Validate and confirm KYC user selection for Salesforce sync |
| `GET` | `/api/v1/settings` | Retrieve global execution preferences |
| `PUT` | `/api/v1/settings` | Update global execution preferences |
| `GET` | `/api/v1/audit` | Fetch chronological audit logs |
| `GET` | `/api/v1/evaluations/history` | Fetch recent evaluation sessions |
