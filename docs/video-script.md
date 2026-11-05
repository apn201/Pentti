# Video script

About 3 minutes 15. Everything a judge needs to understand the problem, the case and the solution is in the first 3:00, the install clip comes after. Live screen, still pictures and text cards. No music, no voice-over fluff (FACTORY_BUILD.md section 15).

The viewer has to get three things:
1. **The problem.** OT nobody owns, now a real target.
2. **The case.** Tervaniemi Works is not empty-handed. It used Jira and Confluence for some projects and maintenance, so bits are written down, a runbook here, a ticket there. How much depends on who wrote it. A clear inventory and a plan of action are missing.
3. **The solution.** In this demo Pentti goes through every scrap of the factory's data, builds a card per machine, says plainly what nobody knows, and turns the worst gaps into Jira tasks. It works on the data bundled with the app, not on a customer's own site, so the script must not suggest otherwise.

Judges know Jira and Confluence, mostly from software teams. One sentence and one shot make clear they were used here for maintenance notes, not for an asset inventory.

Numbers below are what the app shows right after a fresh "Load the factory". Never type or say a number the screen does not show.

## Before recording

1. **Reset and load, on the day you record.** Jira settings, Apps, Pentti: Reset, then Load the factory into TVW and TVW. Dates count from the load, so "leaves in 150 days" is only 150 on load day. Reset also removes the gap tasks and "I checked this" clicks from testing, so "Create tasks" shows new keys on camera. Film the load itself: it is the last clip.
2. **Wait 5 minutes** after the load. The asset cards resync on their own and Rovo Search needs 3 to 4 minutes to index them.
3. **Warm up.** Open the Pentti page once and ask Ask Pentti one throwaway question in a chat you will not film. The first call after idle takes 8 to 12 seconds.
4. **Browser.** One window, 1920x1080, zoom about 110 percent, bookmarks bar hidden, notifications off, no other tabs.
5. **Never show `data/raw/`** or any file from it.
6. **Pictures and cards.** The logo (use the original file full screen, `static/brand/` has small versions), the photo of Pentti, and the text cards below as plain slides: dark green background, white text, the logo small in a corner. If the photo shows a real person, have their consent, the app says its people are generated.
7. Optional: rename the site first (cosmetic), then press "Sync asset cards now" on the admin page.

## Shots

### 0:00 to 0:12 This is Pentti

Style: an old industrial training film. Calm narrator, still pictures, nothing moves that does not have to.

On screen: the Tervaniemi Works logo, then the photo of Pentti at the control cabinet.

Line: "This is Pentti. We usually ask him when something in OT does not work. He is the one that knows. The only one. That is a problem, as in 150 days he goes on retirement."

### 0:12 to 0:32 Why OT, why now

Text cards, about 5 seconds each. The narrator reads them or leaves them silent.

1. "OT: the computers that run the machines. PLCs, panels, switches. Often older than the people who look after them."
2. "For decades nobody cared. It was isolated, it worked, nobody touched it."
3. "October 2026: hackers heated supermarket fridges across France to about 50 degrees, in hundreds of stores. Internet-facing controllers, some on default passwords."
4. "NIS2: EU manufacturers must know their assets and manage the risks. Now companies panic, and hackers feast."

### 0:32 to 0:55 The case: some notes, no inventory

On screen, in this order:
- The Confluence space Tervaniemi Works, page tree open: Operations, Network, Safety, Projects.
- Scroll the page "Spruce line 1 - PLC runbook": a tidy table. Then "Birch line 2 - communication cabinet": short and old.
- The Jira project Tervaniemi Maintenance, the issue list. Open the ticket "birch-l2-cp-04 stopped" (its key changes with every load): "Restarted by hand, do not know why it works."

Line: "Tervaniemi Works is a fictional company, but there are many real ones like that. Industrial manufacturing. A lot of OT systems, but very little ownership, control and documentation. They used Jira and Confluence for some projects and maintenance notes. As usual it differs a lot between people and situations. Some runbooks are good, some pages are years old, some tickets say restarted by hand. And there is a network scan with 522 machines, many of them without a name. A clear inventory and a plan of action are missing."

### 0:55 to 1:15 What Pentti does

On screen: the Pentti page, Asset card tab, birch-l2-cp-04 (Old Faithful). Scroll to "Pages and tickets": each row shows what matched, the hostname or a former name, and a confidence. Then the knowledge part by part table.

Line: "In this demo Pentti goes through all of Tervaniemi's data, the scan, every page and every ticket, and picks up every tiny bit that mentions a machine. By hostname, by IP, by an old address, by the nickname people use on the floor. It builds a card for each machine. And it says what nobody knows."

### 1:15 to 1:40 Ask Pentti

Open Rovo Chat, agent Ask Pentti, new chat. Type: `What happens if Old Faithful dies?`

On screen (check before you keep the take):
- Known: birch-l2-cp-04 (Old Faithful) as a link, Siemens CP 343-1, 33 open findings, one old page and one ticket.
- Not known: owner, fresh documentation, history, checked in person, spare parts, upstream and downstream machines.
- Where I looked: scan 522 assets, 61 demo pages and 150 demo issues bundled with the app, and that your own site was not searched.
- The sentence "Same subnet. Reachability not verified. No routing data."

No line needed, let the answer be read. Click the Old Faithful link, the card opens.

### 1:40 to 2:05 The whole factory, and Pentti

Gap map tab. The counter: "522 assets. 60 are Critical and nobody knows anything about them." Point at the shaded corner, "Risky and nobody knows: 98 assets". Click a dark ringed dot in the corner: nameless plc at 10.4.1.18, knowledge 5, risk 100, danger 95, every line of "What is not known" filled.

People tab. Pentti Vaisanen's row is red: only name on 39 machines, 34 of them Critical, leaves in 150 days.

Line: "Sixty Critical machines nobody knows anything about. And thirty nine where Pentti is the only name."

### 2:05 to 2:35 A plan of action

Closing list tab, plant Birch, 10 assets. Total line: "10 assets, 22.5 hours, removes 15.1 percent of the danger in Birch."

Press "Create tasks for 10 assets", then "Yes, create". Keys appear in the Task column. Click one, the Jira task opens with the steps and hours.

Line: "Not document everything. These ten, in this order, twenty two and a half hours. The tasks go back into Jira, where the team already works."

### 2:35 to 3:00 Found anywhere, honest everywhere

Rovo Search: `Old Faithful`, filter App: Pentti asset cards. The asset card is the first result.

Rovo Chat: `What do we know about the PLC at 10.4.1.18?` The answer: no name, no page, no ticket, nobody who knows it.

Line: "If nobody knows, Pentti says so."

### 3:00 to 3:15 Install

The admin page clip from the prep: Load the factory, the bar fills, "Done. 216 objects created." End card: the logo, "Pentti. Forge, Rovo agent, Teamwork Graph, MCP. Fictional company, real machine mix. A demo on bundled data, it does not read your own site yet."

## After recording

- Upload to YouTube as public, not unlisted.
- Put the link into `docs/devpost-text.md` and the Devpost form.

## Sources for the text cards

- The French supermarket refrigeration attack, October 2026: [ITV](https://www.itv.com/news/2026-10-13/cyberattack-hits-700-supermarkets-in-france-sparking-investigation), [Al Jazeera](https://www.aljazeera.com/economy/2026/10/13/french-fridge-fright-why-supermarkets-have-become-target-for-hackers), [The Next Web](https://thenextweb.com/news/french-supermarket-refrigeration-cyberattack-intermarche), and the Guardian piece of 2026-11-02 that Juha linked. Reported scale differs between 300 and 700 stores, so the card says "hundreds".
- NIS2: Directive (EU) 2022/2555, the same source as the NIS2 page in the demo.
