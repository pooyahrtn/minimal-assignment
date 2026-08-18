# Take-home: embeddable shopping agent, and the page where it gets configured

## The product

We build an AI shopping agent that our customers embed on their own e-commerce website. It helps their visitors work out what they actually want to buy, taking someone from an open-ended need to a confident choice.

Our customers are merchants, and their website is a large part of their brand. An agent that looks like a generic chat bubble stuck onto a carefully made store is a problem for them.

So there are two things to build:

1. **A configuration page on our platform**, where a merchant sets up the agent to match their brand and copies an embed snippet.
2. **The agent itself**, running on an e-commerce website, styled by whatever the merchant configured.

## What we are looking for

Whether you can build interfaces that are intuitive and look good. We will spend more time on how your screens feel to use than on how your code is structured.

The agent is the harder half. It takes on a different brand every time it is embedded, so it has to look right across many configurations, not just the one you designed it against.

## Time

You have 36 hours to turn it in.

## The configuration page

This page is part of our own product, so how it looks is up to you. Give the company a name if it helps.

A merchant should be able to set up the agent for their store and walk away with a snippet to paste into their site.

Two things to know about who is using this page:

- They want the agent to match their brand closely. Close enough is usually not good enough, because it sits on a page they have spent a long time getting right.
- Many of them are not technical. Some will have a hex code and a font name ready. Others will not, and will still expect the result to look like their store.

Those two facts pull against each other. How you resolve them is the interesting part of this surface, so start from who the merchant is and what actually happens when you embed someone else's software in your site, rather than from a list of settings.

## The agent

Build a small e-commerce website and put the agent on it. Invent whatever products you need.

A shopper arrives without knowing exactly what they want. Write their opening message yourself. It should be open-ended and carry at least two constraints, in the spirit of:

> I need a lightweight daily moisturizer for sensitive skin. Nothing greasy, and ideally under 40 euro.

Take them from there to the point where they can confidently act on a product. What that journey looks like and what the agent can do are yours to decide.

The happy path is the easy part. Somewhere in the flow, show us at least one moment where things do not go smoothly: nothing matches what they asked for, or they change their mind halfway through, or something else you think matters more. Pick the one you have something to say about.

The agent must work at 375px wide.

## The part that matters most

Demo the agent under **two visibly different brands.** Not two shades of the same thing. Something like a warm editorial skincare store and a high-contrast technical outdoor brand. Same agent, same code, two configurations.

If it only looks right under one of them, it has been styled rather than built, and that is the difference we are looking for.

## On AI tooling

Use it freely. We would be surprised if you did not, and we will ask you about it.

## What to send

In our WhatsApp thread:

- A deployed link
- The repo
- A one-page `DECISIONS.md`

`DECISIONS.md` should cover:

- How you thought about the merchant using the configuration page, and what you decided to let them control
- How you kept the agent looking right across different brands
- What your AI tooling suggested that you overrode, and why
- What you cut for time
- The weakest part of what you shipped
- What you would do with another hour

(!) Your code does not have to be deployed anywhere, nor is it necessary to create a real AI agent. You can share your code and tell us how to install the required packages, and run this locally. 

## What happens next

Titus reviews your submission. If he likes what he reads, we will invite you into the office to present it. In that session you will demo, walk us through the product and design decisions, and extend the build live.
