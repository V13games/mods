---
# EXAMPLE. Files starting with _ are not on the site. To add a mod: copy this file, name the copy something
# like my-garage.md (no _ in front), fill it in and commit. Leave out any line you don't need.
title: Example Script
game: FiveM
type: Script
version: 1.0.0
released: 2026-11-20
updated: 2026-11-22
requires: ESX or QBCore, ox_lib
price: Free
summary: One or two lines about what it does. This shows on the card and big at the top of its page.
download: https://github.com/
tags: ESX, QBCore, Free
# A picture for the card and the top of the page: upload it to content/images and write  cover: images/name.jpg
# Wide pictures look best (16:9, like 1600x900). Without one, the name is drawn as an outline instead.
cover:
---
Write about the mod here: what it does and why it's good. Everything under the --- line becomes its page.

A YouTube link on its own line turns into a video player. **Bold**, *italics* and [links](https://github.com/) work like on Discord.

## Features
- First thing it does
- Second thing it does
- Works with both ESX and QBCore

## How to install
1. Download it and put the folder in your server's `resources` folder.
2. Add this line to your `server.cfg`:
   ```
   ensure example-script
   ```
3. Restart the server. That's it.

## Config
Everything can be changed in `config.lua`.
