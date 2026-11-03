---
id: pg_001
title: Spruce line 1 - PLC runbook
space: OPS
author: p_antti
class: gold
lastEditedDaysAgo: 120
---
Owner: Antti Rantanen. Backup owner: Mikko Nieminen.
Last full test: September, restore from backup on the bench, all programs loaded and ran.

## Controllers

| Host | What it runs | Spare on shelf | Last backup |
|---|---|---|---|
| [[spruce-l1-plc-03]] | Infeed conveyors | Yes, shelf B4 | 3 weeks ago |
| [[spruce-l1-plc-04]] | Press 1 | Yes, shelf B4 | 3 weeks ago |
| [[spruce-l1-plc-06]] | Press 2 | Shared with plc-04 | 3 weeks ago |
| [[spruce-l1-plc-07]] | Cooling loop | No, order 4 weeks lead | 3 weeks ago |
| [[spruce-l1-plc-08]] | Robot cell interlocks | Yes, shelf B5 | 3 weeks ago |
| [[spruce-l1-plc-09]] | Packing, called [[spruce-l1-plc-09|nick]] on the floor | Yes, shelf B5 | 3 weeks ago |
| [[spruce-l1-plc-10]] | Labeling | No | 3 weeks ago |
| [[spruce-l1-plc-15]] | Palletizer A | Yes, shelf B6 | 3 weeks ago |
| [[spruce-l1-plc-16]] | Palletizer B | Shared with plc-15 | 3 weeks ago |
| [[spruce-l1-plc-17]] | Wrapper | No | 3 weeks ago |
| [[spruce-l1-plc-18]] | Outfeed. [[spruce-l1-plc-18|nick]] because of the status LED | Yes, shelf B6 | 3 weeks ago |

## Restart order
1. Cooling loop first, wait for flow OK on the panel.
2. Presses, then robot cell interlocks.
3. Packing and outfeed last. If [[spruce-l1-plc-09|nick]] does not come up, check the profinet cable at the cabinet door, it gets pinched.

## Vendor contact
Siemens support through the service contract, number on the cabinet door. Contract ends in 2027.
