# Publish copy

Paste-ready text for YouTube, the repo and posts. Devpost has its own file, `docs/devpost-text.md`. `[fill: ...]` marks what exists only after the upload or only Juha can say. Numbers are the app's, a fresh load shows them.

## YouTube

### Title (max 100 characters)

Pentti: a Rovo agent that says what a factory does not know | Codegeist 2026

Other option:

Pentti retires in 150 days. A Forge app for what only he knows | Codegeist 2026

### Description

Pentti is the maintenance electrician at Tervaniemi Works, and he goes on retirement in 150 days. He is the only name on 39 machines.

This is my entry to Atlassian Codegeist 2026, category Apps for Specialized Industries. It is a Forge app for Jira, Confluence and Rovo. It takes a factory's machines from a network scan, matches them to the pages and tickets that mention them, and scores each machine on how much is known about it and how risky it is. When nobody knows, Ask Pentti says so and says where it looked.

It is a demo. The company and its people are fictional and bundled in the app, the machine mix comes from an anonymized OT scan of a real plant. Every number in the app has a chip: SCAN for the scan, GEN for generated, SCORE for computed. The scores are plain code with tests, the model does no arithmetic. Importing your own asset list as CSV is there too, as a read-only proof of concept, not shown in this video.

Install link and steps: https://github.com/apn201/Pentti
Devpost: [fill: Devpost project link]

Chapters
0:00 This is Pentti
0:12 Why OT, why now
0:32 The case: some notes, no inventory
0:55 What Pentti does
1:15 Ask Pentti in Rovo Chat
1:40 The whole factory on one map
2:05 A plan of action, tasks in Jira
2:35 Rovo Search, and an honest not known
3:00 Install

Sources for the fridge attack and NIS2 are in docs/video-script.md in the repo. Scores and answers are not a safety, security or compliance assessment.

#Codegeist #AtlassianForge #Rovo

### Tags (421 characters, YouTube allows 500)

Pentti, Codegeist, Codegeist 2026, Atlassian, Atlassian Forge, Forge app, Rovo, Rovo agent, Rovo Chat, Teamwork Graph, Atlassian MCP, MCP, Jira, Confluence, OT security, operational technology, OT asset inventory, asset inventory, NIS2, manufacturing, industrial cybersecurity, ICS security, PLC, bus factor, knowledge management, knowledge loss, retirement knowledge transfer, hackathon, Claude Code, factory maintenance

### Settings

- Visibility: Public. The rules want it publicly visible, unlisted is not enough to be safe.
- Category: Science & Technology.
- Audience: not made for kids.
- Language: English. Add captions, the auto ones get Pentti and Tervaniemi wrong.
- Altered or synthetic content: answer Yes if the photo of Pentti is AI generated and looks real. [fill: where the photo comes from]
- Thumbnail: `docs/media/thumb-youtube-1280x720.png`. Custom thumbnails need a verified channel.
- Allow embedding on, Devpost plays the video through an embed.

## GitHub repo

Description and topics are empty at the moment.

```bash
gh repo edit apn201/Pentti --description "Forge app that measures what a factory does not know about its own machines. Rovo agent, Teamwork Graph, MCP. Codegeist 2026 demo on bundled data." --add-topic atlassian-forge --add-topic rovo --add-topic jira --add-topic confluence --add-topic teamwork-graph --add-topic mcp --add-topic ot-security --add-topic nis2 --add-topic codegeist
```

## Devpost media

Gallery order: `gap-map.png`, `asset-card.png`, `closing-list.png`, `people.png`, `rovo-chat.png`, `rovo-search.png`, all in `docs/media/`. Thumbnail: `docs/media/thumb-devpost-3x2.png`. Captions:

- Gap map: 522 machines, knowledge against risk. Top right is risky and nobody knows anything.
- Asset card: known, not known, where it looked. Chips on every number.
- Closing list: the assets to document first, hours per step, percent of danger removed.
- People: Pentti leaves in 150 days and is the only name on 39 machines.
- Rovo Chat: "What happens if Old Faithful dies?" Three parts, and it lists what nobody knows.
- Rovo Search: the asset card found by a nickname.

## LinkedIn

Made an entry to Atlassian Codegeist. It is called Pentti, after a fictional maintenance electrician who retires in 150 days and is the only name on 39 machines.

Every manufacturer has a scanner export somewhere. It knows the box, the IP and the firmware. It does not know what the machine does, who fixes it or where the runbook is. I wanted an agent that is allowed to say "nobody knows", so I built one as a Forge app for Jira, Confluence and Rovo. It runs on a fictional factory, with the machine mix from an anonymized OT scan.

It lists the machines to document first, with hours per step, and creates the Jira tasks after a yes. Mostly built with Claude Code from a written spec. Admittedly a demo, your own data is only a read-only proof of concept.

Video: [fill: YouTube link]
Code and install link: https://github.com/apn201/Pentti

#Codegeist #AtlassianForge #OTsecurity #NIS2

## X, Bluesky

Pentti retires in 150 days and is the only name on 39 machines. Fictional, but you know the guy. Made a Rovo agent for it, for Codegeist. It says "not known" when nobody knows. [fill: YouTube link]
