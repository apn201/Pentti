# Video script

Under 3 minutes of content, hard cap 5. Judges are not required to watch past 3:00, so everything that scores is in the first three minutes. Live, no music, no voice-over fluff (FACTORY_BUILD.md section 15).

Numbers below are what the app shows right after a fresh "Load the factory". They come from the app, never type or say a number the screen does not show.

## Before recording

1. **Reset and load, on the day you record.** Jira settings, Apps, Pentti: Reset, then Load the factory into TVW and TVW. Dates count from the load, so "leaves in 150 days" is only 150 on load day. Reset also removes the gap tasks and "I checked this" clicks from testing, so "Create tasks" shows new keys on camera. Film the load itself: it is the last clip (2:40).
2. **Wait 5 minutes** after the load. The asset cards resync on their own and Rovo Search needs 3 to 4 minutes to index them.
3. **Warm up.** Open the Pentti page once and ask Ask Pentti one throwaway question in a chat you will not film. The first call after idle takes 8 to 12 seconds.
4. **Browser.** One window, 1920x1080, zoom about 110 percent, bookmarks bar hidden, notifications off, no other tabs.
5. **Never show `data/raw/`** or any file from it. The hook numbers are said or captioned, not shown from the export.
6. Optional: rename the site first (cosmetic), then press "Sync asset cards now" on the admin page.

## Shots

### 0:00 to 0:15 Hook

On screen: the Pentti page, Gap map tab. The counter line reads "522 assets. 60 are Critical and nobody knows anything about them."

Line: "A scanner export with 4,695 rows, 874 of them without a hostname. The scanner knows the box. Nobody knows the machine."

### 0:15 to 0:50 Rovo Chat, Old Faithful

Open Rovo Chat, agent Ask Pentti, new chat. Type: `What happens if Old Faithful dies?`

On screen (check before you keep the take):
- Known: birch-l2-cp-04 (Old Faithful) as a link, Siemens CP 343-1 (SCAN), 33 open findings, one page and one ticket (the page is old).
- Not known: owner, fresh documentation, history, checked in person, spare parts, upstream and downstream machines.
- Where I looked: scan 522 assets, 61 pages, 150 issues.
- The blast radius sentence: "Same subnet. Reachability not verified. No routing data."

Click the Old Faithful link. The Pentti page opens on its asset card: knowledge 40, risk 95, danger 57.

### 0:50 to 1:30 Gap map and people

Gap map tab. Point at the shaded top right corner, "Risky and nobody knows: 98 assets". Hover one dot, click a dark ringed one in the corner. Card shows knowledge 5, risk 100, danger 95 for the nameless plc at 10.4.1.18, every line of "What is not known" filled.

People tab. Pentti Vaisanen's row is red: only name on 39 machines, 34 of them Critical, leaves in 150 days.

### 1:30 to 2:15 Closing list

Closing list tab, plant Birch, 10 assets. Total line: "10 assets, 22.5 hours, removes 15.1 percent of the danger in Birch."

Press "Create tasks for 10 assets", then "Yes, create". Keys appear in the Task column and the green line lists them. Click one key, the Jira issue opens.

### 2:15 to 2:40 Graph and honesty

Rovo Search: `Old Faithful`, filter App: Pentti asset cards. The asset card is the first result.

Back in Rovo Chat: `What do we know about the PLC at 10.4.1.18?` The answer says nobody touched it, no page, no ticket, no owner. Optional: the same question in Claude through the MCP connector.

### 2:40 to 3:00 Install

The admin page clip from the prep: Load the factory, the bar fills, "Done. 216 objects created." Line: "Fictional company, real machine mix."

## After recording

- Upload to YouTube as public, not unlisted.
- Put the link into `docs/devpost-text.md` and the Devpost form.
