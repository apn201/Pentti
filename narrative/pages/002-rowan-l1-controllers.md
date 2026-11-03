---
id: pg_002
title: Rowan line 1 - controllers and remote IO
space: OPS
author: p_ville
class: gold
lastEditedDaysAgo: 200
---
Owner: Ville Hamalainen. Tested a cold start in the spring shutdown, took 14 minutes.

| Host | Address | Role | Spare |
|---|---|---|---|
| [[rowan-l1-plc-01]] | [[rowan-l1-plc-01|ip]] | Mixer A | Yes |
| [[rowan-l1-plc-02]] | [[rowan-l1-plc-02|ip]] | Mixer B | Yes |
| [[rowan-l1-plc-03]] | [[rowan-l1-plc-03|ip]] | Dosing | No, ordered |
| [[rowan-l1-plc-04]] | [[rowan-l1-plc-04|ip]] | Safety, F-CPU | Yes, sealed box |
| [[rowan-l1-plc-05]] | [[rowan-l1-plc-05|ip]] | Safety, F-CPU, called [[rowan-l1-plc-05|nick]] | Same box |
| [[rowan-l1-plc-06]] | [[rowan-l1-plc-06|ip]] | Filling | Yes |
| [[rowan-l1-plc-07]] | [[rowan-l1-plc-07|ip]] | Capping | Yes |
| [[rowan-l1-io-01]] | [[rowan-l1-io-01|ip]] | Remote IO, tank farm | No |
| [[rowan-l1-io-02]] | [[rowan-l1-io-02|ip]] | Remote IO, dosing skid | No |

Safety programs are signed off by Jukka Salminen. Do not load a safety program without him.

Backups are on the engineering laptop and on the share, folder Rowan/L1. The share copy is the one that counts.
