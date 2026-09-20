# Permission matrix

| Resource | Admin | Employee | Customer | Guest |
| --- | --- | --- | --- | --- |
| Own profile | Yes | Yes | Yes | No |
| Own schedule | Yes | Yes | No | No |
| Other schedules | Yes | No | No | No |
| Own appointments | Yes | Assigned only | Yes | Lookup by phone + confirmation code |
| Create booking | Yes | Own only | Yes | Yes |
| Payments | Yes | Read own comm. | Own summaries | No |

This document is the intended access matrix for reference while implementing specific permission checks later. It is intentionally documentation-only for this step.
