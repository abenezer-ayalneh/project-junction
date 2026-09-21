# ADR-0003: Nx Modular Monolith with a Worker

**Status:** Accepted target architecture; not implemented  
**Decision:** `DEC-080`–`DEC-082`  
**Date:** 2026-08-27

Use an Nx workspace with one authoritative application/API boundary and a separate background worker, organized by bounded-context ownership. The alternative—premature distributed services—adds operational complexity beyond the portfolio capacity. Context boundaries remain explicit so later extraction is possible without treating it as a current need.
