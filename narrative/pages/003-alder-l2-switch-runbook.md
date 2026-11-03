---
id: pg_003
title: Alder line 2 - switch runbook
space: OPS
author: p_leena
class: gold
lastEditedDaysAgo: 90
---
Owner: Leena Koskinen. Configs exported last month, diffed against the previous export, no surprises.

- [[alder-l2-sw-01]]: core of the line. Two uplinks, both labelled. Spare: one SF200 in the store.
- [[alder-l2-sw-02]]: [[alder-l2-sw-02|nick]]. Came from the old packing line. Works. Spare: same as sw-01.
- [[alder-l2-sw-05]]: the only managed switch with a working SNMP community. Spare: none.
- [[alder-l2-sw-09]]: [[alder-l2-sw-09|nick]]. Power cycle fixes it, the root cause is a bad PSU. New PSU ordered.
- [[alder-l2-sw-03]]: [[alder-l2-sw-03|nick]], next to the dryer. Runs hot. Fan replaced in March.
- [[alder-l2-sw-04]]: access switch for the panels.

Test: pulled each uplink in turn during the October stop. The line kept running.
