# Cash Holdings Dashboard

Build a private internal operating system called CASH HOLDINGS.

This is a desktop-first portfolio command center for managing brands, projects, tasks, CRM, and analytics. It should feel like a dark luxury operator dashboard designed by Truett Cash — not a generic startup SaaS product.

VISUAL DIRECTION

- Matte black / obsidian background

- Charcoal panels with subtle glass depth

- Off-white typography

- Stylish turquoise / electric teal accents for active states, metrics, links, and important controls

- Minimal gradients; no purple, pink, bright blue, or generic AI-SaaS styling

- High information density with precise spacing

- Premium editorial typography paired with technical mono labels

- Thin borders, soft shadowing, restrained rounded corners

- Quiet, expensive, tactical, and modern

- Think: private equity operating dashboard × dark luxury creative director × technical systems console

APP NAME

Cash Holdings

CORE NAVIGATION

Create a persistent left sidebar with:

- Overview

- Portfolio

- Projects

- CRM

- Analytics

- Brand Detail

- Settings

OVERVIEW PAGE

Build a portfolio command center containing:

- Active Projects

- Tasks In Progress

- Blocked Tasks

- Critical Tasks

- Open Pipeline Value

- Upcoming CRM Actions

- Recent Activity Timeline

- Latest Channel Metrics

- Brand health cards for Vera Inc., Truett Cash, ATHRTY.SYS, Throttle Kings, and Transit Industries

Use a grid-based executive dashboard layout. Make the overview feel like a live operating cockpit.

PROJECTS PAGE

Create a strong project execution interface:

- Filter projects by brand, status, priority, and project type

- Project list view

- Selected project detail panel

- Linked task list

- Task controls for:

  todo

  in_progress

  blocked

  completed

  archived

- Priority indicators:

  low

  medium

  high

  critical

- Show due dates, blockers, descriptions, and completion state

- Include a clean “Add Task” action

- Make project tasks easy to scan quickly

CRM PAGE

Build a CRM with:

- Organizations table

- Contacts table

- Deals pipeline

- Activity timeline

- Deal stages:

  new

  qualified

  discovery_scheduled

  proposal_sent

  negotiation

  won

  lost

  nurture

- Show organization details with linked contacts, deals, and activities

- Show next action and next-action due dates prominently

- Include a Kanban-style deal pipeline option

- Use clean dark cards and compact operational tables

ANALYTICS PAGE

Build an analytics workspace for:

- Brand selector

- Channel selector

- Metric selector

- KPI cards for followers, subscribers, views, reach, engagements, sessions, pageviews, leads, conversions, revenue, and orders

- Time-series trend charts using recorded metric observations

- Latest observation table

- Clean empty states for metrics that are not populated yet

- Do not invent analytics data

BRAND DETAIL PAGE

Create a reusable brand profile view for:

- Vera Inc.

- Truett Cash

- ATHRTY.SYS

- Throttle Kings

- Transit Industries

Each brand detail page should display:

- Brand overview

- Active channels

- Current projects

- Open tasks

- CRM deal activity

- Latest recorded metrics

- Recent activity

SUPABASE DATA RULES

Use the existing Supabase database only. Do not create new tables, modify columns, change foreign keys, or run schema migrations.

Existing tables:

- Brands

- Channels

- Projects

- project_tasks

- organizations

- contacts

- deals

- activities

- metric_definitions

- metric_observations

Existing relationships:

- Projects.brand_id → Brands.id

- project_tasks.project_id → Projects.id

- Channels.brand_id → Brands.id

- metric_observations.channel_id → Channels.id

- metric_observations.metric_definition_id → metric_definitions.id

- contacts.organization_id → organizations.id

- deals.brand_id → Brands.id

- deals.organization_id → organizations.id

- deals.primary_contact_id → contacts.id

- activities.brand_id → Brands.id

- activities.organization_id → organizations.id

- activities.contact_id → contacts.id

- activities.deal_id → deals.id

IMPORTANT INTERFACE RULES

- Show readable names in the UI, never raw UUIDs

- Preserve all existing database relationships

- Use real Supabase records once connected

- Do not use mock data after Supabase is connected

- Do not expose database IDs in normal UI views

- Keep the app private and operational, not customer-facing

- Prioritize the Projects page and its linked task workflow first

Start by building:

1. App shell and sidebar

2. Overview dashboard

3. Projects page with linked project tasks

4. CRM page

5. Analytics page

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://cash-holdings-os.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/887516ad-65bf-4188-a5c1-e2c4a467c50b).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
