# Pentti - privacy policy

Last updated: 2026-11-05.

Pentti is a free Forge app for Jira and Confluence, built for Atlassian Codegeist 2026 by Juha Lilja, info@apn201.com

## What Pentti stores

Pentti stores data only in Forge storage on Atlassian's infrastructure. It sends no data to servers outside Atlassian.

- When someone presses "I checked this" on a machine, Pentti stores that person's Atlassian account ID and the time. On the bundled data this is the only personal data Pentti stores.
- Setup data: the Jira project key and Confluence space key chosen on the admin page, the ids and keys of the pages and issues Pentti created, the install date, and the Teamwork Graph connection id.
- Only if a Jira admin imports own data: the asset list as given, plus the titles, keys, dates and statuses of the pages and issues read, and which machines matched them. Those may contain whatever the admin's data contains, including names of people. Page and ticket text is read to look for machine names and is not stored. Do not import data you may not process this way.

## What Pentti writes to your site

- Demo Confluence pages and Jira issues, labelled `pentti-demo`.
- Jira tasks that a user asks Pentti to create. They are created as that user.
- One asset card per machine in the Teamwork Graph, when an admin connects the Pentti connector.

Own data is read only. It writes nothing to your site, creates no tasks and sends no cards to the Teamwork Graph.

## Who sees the data

Nobody outside Atlassian receives data from Pentti. While a site runs on own data, only Jira admins get answers. Rovo Chat conversations with the Ask Pentti agent are processed by Atlassian under Atlassian's own terms. If an admin enables Pentti's MCP tools and a user connects an AI client, that client receives the answers of the tools the user calls.

Pentti has no analytics and sets no cookies. It does not sell or share data.

## Deleting data

Reset on the Pentti admin page removes everything Pentti created on the site and the stored "I checked this" records. "Delete my data" removes all imported own data and its "I checked this" records from Forge storage, and changes nothing in Jira or Confluence. Uninstalling the app removes its Forge storage under Atlassian's rules for Forge apps.

## The demo data

The company Tervaniemi Works and its people are fictional. The machines come from an anonymized scanner export. No real person's data is in the dataset.
