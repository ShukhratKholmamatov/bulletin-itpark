# 📘 IT Park Strategic Analysis Portal

![Version](https://img.shields.io/badge/version-1.2.0_Beta-blue) ![Status](https://img.shields.io/badge/status-Operational-success) ![Node](https://img.shields.io/badge/Node.js-v14+-green)

A centralized strategic intelligence dashboard designed for executives and analysts at **IT Park Uzbekistan**. It aggregates global tech news, monitors legislative changes (NLA) across multiple jurisdictions, and provides market intelligence on local companies using a hybrid data approach.

---

## 🚀 Key Capabilities

* **🌐 Global News Aggregation:** Real-time fetching from Google News, TechCrunch, and VentureBeat with keyword filtering.
* **⚖️ Multi-Jurisdiction NLA:** Direct access to legal databases of Uzbekistan (Lex.uz), Kazakhstan (Adilet), Singapore (SSO), UK, and USA.
* **🏢 Market Intelligence Engine:** A "Smart Adapter" system that searches local registry data (`companies.json`) and uses AI-logic to estimate financials and industry codes (OKED).
* **📊 Strategic Analytics:** Interactive dashboards visualizing topic trends, source reliability, and user engagement.
* **📑 Executive Reporting:** One-click PDF report generation and Telegram dissemination.

---

## 🛠️ Technology Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Backend** | **Node.js + Express** | RESTful API, Scrapers, and Proxy Server. |
| **Database** | **SQLite3** | Lightweight relational DB (`news.db`) for Users & Saved Items. |
| **Frontend** | **Vanilla JS + HTML5** | Custom "Glassmorphism" UI, no frameworks required. |
| **Visualization** | **Chart.js** | Interactive Pie, Bar, and Line charts for financial estimates. |
| **Scraping** | **Cheerio + Axios** | DOM parsing for external legal databases (Lex.uz, Orginfo). |
| **Auth** | **Passport.js** | Google OAuth 2.0 and Local Strategy. |

---

## 📂 Project Structure

```bash
bulletin-itpark/
├── backend/
│   ├── app.js                 # Main Server (Routes, Proxies, Logic)
│   ├── config/
│   │   ├── db.js              # SQLite Connection Setup
│   │   └── passport.js        # Authentication Strategies
│   └── database/
│       └── news.db            # Database File (Auto-generated)
├── frontend/
│   ├── index.html             # Main Dashboard UI
│   ├── admin.html             # Admin Control Panel
│   ├── style.css              # Styling (CSS Variables, Glassmorphism)
│   ├── script.js              # Frontend Logic (Charts, Search, API calls)
│   ├── companies.json         # Local Company Registry Database
│   └── img/                   # Assets (Logos, Icons)
├── .env                       # Environment Variables (Secrets)
└── package.json               # Dependencies