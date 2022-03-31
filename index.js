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
  crypto = require("crypto"),
  // In prod remove the ".default" and vice versa
  Enmap = require("enmap"),
  chaindb = new Enmap({
    name: "chaindb",
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

client.on("messageCreate", async (message) => {
  if (message.content.toLowerCase().startsWith(procenv.PREFIX))
    cmdHandler(message);
  if (
    message.author.bot ||
    (await message.member.fetch()).roles.cache.find((r) =>
      r.name.toLowerCase().includes("staff")
    )
  )
    return;

  if (!message.content.includes("🥬")) return;
  logger(`${message.author.tag} said ${message.content}`);

  let chain = chaindb.get("chain")
      ? chaindb.get("chain")
      : chaindb.set("chain", [
          {
            id: 0,
            name: "genesis",
            owner: procenv.OWNER,
            rarity: procenv.RARITYCAP,
            validationCeleries: [],
            mintReq: 1,
            hash: undefined,
            previousCelery: undefined,
          },
        ]),
    wallets = chaindb.get("wallets")
      ? chaindb.get("wallets")
      : chaindb.set("wallets", [
          {
            id: procenv.OWNER,
            ownedCeleries: [0],
          },
          {
            id: client.user.id,
            ownedCeleries: [],
          },
        ]),
    celeries = message.content
      .split(/ +/g)
      .filter((w) => w.includes("🥬"))
      .slice(0, 10),
    calculated = [];

  for (let i = 0; i < celeries.length; i++) {
    // Calculate for each celery their validity,
    // the more balanced the celeries:message.content.length is,
    // the more likely it is to be valid
    let ratio = celeries.length / message.content.length;
    function randControlled(r) {
      if (r >= 1) r = r / Math.pow(10, Math.floor(r).length);
      let rand = Math.random(),
        validity = rand >= Math.abs(0.5 - r);
      return validity;
    }
    let validation = randControlled(ratio);

    if (validation[1]) {
      calculated.push({
        celery: celeries[i],
        validity: validation[0],
      });
    }
  }

  if (!calculated.length) return;

  // If the calculated array is not empty,
  // Check if enough celeries are valid to mint a non-fungible celery
  if (calculated.length >= procenv.MINTREQ) {
    // If so, mint a non-fungible celery
    let minted = {
      id: chain.length,
      name: `${calculated.join(" ")}`,
      owner: procenv.OWNER,
      rarity: procenv.RARITYCAP,
      validationCeleries: calculated,
      mintReq: Math.floor(Math.random() * procenv.RARITYCAP) + 1,
      hash: undefined,
      previousCelery: crypto
        .createHash("sha256")
        .update(JSON.stringify(chain[chain.length - 1]))
        .digest("hex"),
    };

    minted.hash = crypto
      .createHash("sha256")
      .update(
        crypto
          .createHash("sha256")
          .update(JSON.stringify(minted))
          .digest("hex") + minted.previousCelery
      )
      .digest("hex");

    // Add the minted celery to the chain
    chain.push(minted);

    // Check if user has a wallet
    // If not, create one
    if (!wallets.find((w) => w.id === message.author.id)) {
      wallets.push({
        id: message.author.id,
        ownedCeleries: [minted.id],
      });
    } else {
      // If so, add the minted celery to the user's wallet
      wallets
        .find((w) => w.id === message.author.id)
        .ownedCeleries.push(minted.id);
    }

    // Update the chaindb
    chaindb.set("chain", chain);
    chaindb.set("wallets", wallets);

    // React to the message to tell the user that a non-fungible celery was minted
    message.react("🥬");

    // Log the minted celery
    logger(`Minted ${minted.hash} to ${message.author.tag}`);
  }

  // Command handler
  function cmdHandler(message) {
    let args = message.content.slice(procenv.PREFIX.length).split(/ +/g),
      cmd = args.shift().toLowerCase(),
      subcmd = args.shift().toLowerCase();

    if (cmd != "celery") return;

    if (subcmd == "help") {
      let embed = new Discord.MessageEmbed()
        .setColor("#0099ff")
        .setTitle("Non-Fungible Celeries")
        .setDescription("Rare and valuable celeries!")
        .addField(
          "Commands:",
          `${procenv.PREFIX}celery help\n${procenv.PREFIX}celery info <celery id>\n${procenv.PREFIX}celery list <user id>\n${procenv.PREFIX}celery exchange <celery id>`
        )
        .setFooter({
          text: `Current celery minting requirement: ${procenv.MINTREQ}\nCurrent celery in circulation: ${chain.length}`,
        });
      message.channel.send(embed);
    } else if (subcmd == "info") {
      let celery = chain.find((c) => c.id == args[0]);
      if (!celery)
        message.reply({
          content: "Celery with that id does not exist!",
          allowedMentions: { mentionedUser: false },
        });

      let rarityString, rarityColor;

      switch (celery.rarity) {
        case 1:
          rarityString = "Common";
          rarityColor = "#0099ff";
          break;
        case 2:
          rarityString = "Uncommon";
          rarityColor = "#00ff00";
          break;
        case 3:
          rarityString = "Rare";
          rarityColor = "#ff9900";
          break;
        case 4:
          rarityString = "Epic";
          rarityColor = "#ff0000";
          break;
        default:
          rarityString = "Legendary";
          rarityColor = "#ffff00";
          break;
      }

      let embed = new Discord.MessageEmbed()
        .setColor(rarityColor)
        .setTitle(`${celery.owner}'s Celery of ${celery.name}`)
        .setDescription(
          `ID: #${
            celery.id
          }\nRarity: ${rarityString}\nValidation celeries: ${celery.validationCeleries
            .map((c) => JSON.stringify(c))
            .join(", ")}\nMinting requirement: ${celery.mintReq}`
        )
        .setFooter(
          `Current celery minting requirement: ${procenv.MINTREQ}\nCurrent celery in circulation: ${chain.length}`
        );
      message.channel.send(embed);
    } else if (subcmd == "list") {
      let user = wallets.find((w) => w.id == args[0]);
      if (!user)
        message.reply({
          content: "User with that id does not exist!",
          allowedMentions: { mentionedUser: false },
        });

      let embed = new Discord.MessageEmbed()
        .setColor("#0099ff")
        .setTitle(`${user.id}'s Celery List`)
        .setDescription(`${user.ownedCeleries.map((c) => `#${c}`).join("\n")}`)
        .setFooter(
          `Current celery minting requirement: ${procenv.MINTREQ}\nCurrent celery in circulation: ${chain.length}`
        );
      message.channel.send(embed);
    } else if (subcmd == "exchange") {
      let celery = chain.find((c) => c.id == args[0]);
      if (!celery)
        message.reply({
          content: "Celery with that id does not exist!",
          allowedMentions: { mentionedUser: false },
        });

      let user = wallets.find((w) => w.id == message.author.id);
      if (!user)
        message.reply({
          content: "You do not have a wallet!",
          allowedMentions: { mentionedUser: false },
        });

      if (!user.ownedCeleries.includes(celery.id))
        message.reply({
          content: "You do not own this celery!",
          allowedMentions: { mentionedUser: false },
        });
    }
  }
});
