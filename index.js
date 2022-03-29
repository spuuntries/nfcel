// Copyright 2022 Spuun, Art Union Org.
// Licensed under WTFPL 2.0

require("dotenv").config();
const Discord = require("discord.js"),
  client = new Discord.Client({
    intents: [
      "GUILDS",
      "GUILD_MEMBERS",
      "GUILD_MESSAGES",
      "GUILD_MESSAGE_REACTIONS",
      "DIRECT_MESSAGES",
      "DIRECT_MESSAGE_REACTIONS",
    ],
  }),
  procenv = process.env,
  // In prod remove the ".default"
  Enmap = require("enmap").default,
  db = new Enmap({
    name: "db",
  });

function logger(msg) {
  console.log(`[${new Date()}] ${msg}`);
}

function login(token) {
  client.login(token).catch(() => {
    logger(`Failed to login, retrying in 5 seconds...`);
    setTimeout(login(procenv.TOKEN), 5000);
  });
}

login(procenv.TOKEN);

client.on("ready", () => {
  logger(`Logged in as ${client.user.tag}!`);
});

client.on("message", async (message) => {
  if (
    message.author.bot ||
    (await message.member.fetch()).roles.cache.find((r) =>
      r.name.toLowerCase.includes("staff")
    )
  )
    return;
});
