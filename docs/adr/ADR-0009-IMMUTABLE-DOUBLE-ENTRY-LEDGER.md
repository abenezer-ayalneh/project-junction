# ADR-0009: Immutable Double-Entry Ledger and Delayed Earnings

**Status:** Accepted  
**Decision:** `DEC-038`, `DEC-140`, `DEC-187`, `DEC-188`  
**Date:** 2026-08-27

Financial effects are modeled as balanced immutable postings with compensating reversals, while Vendor earnings release after policy-defined risk windows. The alternative—editable balances—would obscure reconciliation and dispute history. It adds accounting discipline but makes financial states explainable.
