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
  { Client } = require("unb-api"),
  unbClient = new Client(procenv.UNBTOKEN),
  phonetic = require("phonetic"),
  // In prod remove the ".default" and vice versa
  Enmap = require("enmap"),
  chaindb = new Enmap({
    name: "chaindb",
  });

function logger(msg) {
  console.log(`[${new Date()}] ${msg}`);
}

function login() {
  client.login(procenv.TOKEN).catch(() => {
    logger(`Failed to login, retrying in 5 seconds...`);
    setTimeout(login, 5000);
  });
}

function randControlled(r) {
  if (r >= 1) r = r / Math.pow(10, Math.floor(r).length);
  let rand = Math.random(),
    validity = rand <= Math.abs(0.5 - r);
  return validity;
}

login();

client.on("ready", () => {
  logger(`Logged in as ${client.user.tag}!`);
  /** @type {{
   *   block: {
   *    name: String,
   *    id:Number,
   *    owner: String,
   *    rarity: Number,
   *    validationCeleries: Array[Any],
   *    mintReq: Number,
   *    hash: String | undefined,
   *    previousCelery: Object
   *  },
      displayName: String
   * }[]} */
  chaindb.get("chain")
    ? chaindb.get("chain")
    : chaindb.set("chain", [
        {
          block: {
            id: 0,
            name: "genesis",
            minter: procenv.OWNER,
            rarity: procenv.RARITYCAP,
            validationCeleries: [],
            mintReq: 1,
            hash: undefined,
            previousCelery: undefined,
          },
          displayName: "genesis",
        },
      ]);
  /** @type {{
   *  id: Number,
   *  ownedCeleries: Number[]
   * }[]} */
  chaindb.get("wallets")
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
      ]);
});

client.on("messageCreate", async (message) => {
  /** @type {{
   *   block: {
   *    name: String,
   *    id:Number,
   *    owner: String,
   *    rarity: Number,
   *    validationCeleries: Array[Any],
   *    mintReq: Number,
   *    hash: String | undefined,
   *    previousCelery: Object
   *  },
      displayName: String
   * }[]} */
  let chain = chaindb.get("chain")
      ? chaindb.get("chain")
      : chaindb.set("chain", [
          {
            block: {
              id: 0,
              name: "genesis",
              minter: procenv.OWNER,
              rarity: procenv.RARITYCAP,
              validationCeleries: [],
              mintReq: 1,
              hash: undefined,
              previousCelery: undefined,
            },
            displayName: "genesis",
          },
        ]),
    /** @type {{
     *  id: Number,
     *  ownedCeleries: Number[]
     * }[]} */
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
        ]);

  if (message.content.toLowerCase().trim().startsWith(procenv.PREFIX))
    await cmdHandler(message);
  if (message.author.bot) return;

  if (!message.content.includes("🥬")) return;

  let celeries = message.content
      .split(/ +/g)
      .filter((w) => w.includes("🥬"))
      .slice(0, chain[chain.length - 1].block.mintReq * 2),
    calculated = [];

  logger(`${message.author.tag} said ${message.content}`);

  for (let i = 0; i < celeries.length; i++) {
    // Calculate for each celery their validity,
    // the more balanced the celeries:message.content.length is,
    // the more likely it is to be valid
    let ratio =
      celeries.length /
      message.content.split("").filter((w) => !w.includes("🥬") && w.length)
        .length;
    let validation = randControlled(ratio);

    if (validation) {
      calculated.push({
        celery: celeries[i],
        validity: [ratio, validation],
      });
    }
  }

  console.log(calculated);

  if (!calculated.length) return;

  // If the calculated array is not empty,
  // Check if enough celeries are valid to mint a non-fungible celery
  if (calculated.length >= chain[chain.length - 1].block.mintReq) {
    // If so, mint a non-fungible celery
    let minted = {
      id: chain.length,
      name: phonetic.generate({ syllables: 2, phoneticSimplicity: 6 }),
      minter: message.author.id,
      rarity: calculated.length,
      validationCeleries: calculated,
      mintReq: Math.floor(Math.random() * procenv.RARITYCAP) + 1,
      hash: undefined,
      previousCelery: crypto
        .createHash("sha256")
        .update(JSON.stringify(chain[chain.length - 1].block))
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
    chain.push({ block: minted, displayName: minted.name });

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

  /**
   * Command handler
   * @param {Discord.Message} message
   */
  async function cmdHandler(message) {
    let args = message.content.slice(procenv.PREFIX.length).trim().split(/ +/g),
      cmd = args.shift().toLowerCase(),
      subcmd = args.shift().toLowerCase();

    if (cmd != "celery") return;

    if (subcmd == "help") {
      let embed = new Discord.MessageEmbed()
        .setAuthor({ iconURL: message.guild.iconURL(), name: "NFCel" })
        .setColor("#0099ff")
        .setTitle("Non-Fungible Celeries 🥬")
        .setDescription("Rare and valuable celeries!")
        .setThumbnail("https://i.imgur.com/39Iw6cf.png")
        .addField(
          "🗨️ Commands:",
          `**${procenv.PREFIX}celery help** - \` Shows this message \` 
**${procenv.PREFIX}celery info <celery id>** - \` Shows information about a celery \` 
**${procenv.PREFIX}celery list <user id>** - \` Shows a list of celeries owned by a user \` 
**${procenv.PREFIX}celery give <user id> <celery id>** - \` Give a celery to a user \` 
**${procenv.PREFIX}celery exchange <celery id> <user id>** - \` Exchanges a celery for cookies, based on rarity \` 
**${procenv.PREFIX}celery rename <celery id> <new name>** - \` Renames a celery's display name, if user has enough cookies (10 cookies) \` `
        )
        .addField(
          "✨ How rarity works ✨",
          `
E.g. 
\`\`\`
If minting requirement is 3, and your message has at least 3 "🥬" that are valid, you will get a celery!
\`\`\`
\` Common \`: **1** 🥬
\` Uncommon \`: **2** 🥬
\` Rare \`: **3** 🥬
\` Epic \`: **4** 🥬
\` Legendary \`: **>= 5** 🥬
**1 validation celery = 1 rarity.**
Anything above **rare** will have an extra reward on exchange.
`
        )
        .setFooter({
          text: `Current celery minting requirement: ${
            chain[chain.length - 1].block.mintReq
          }
Current number of celeries in circulation: ${chain.length}
Get a rare or higher celery for a special gift on exchange!`,
        });

      message.reply({
        embeds: [embed],
        allowedMentions: {
          mentionedUser: false,
        },
      });
    } else if (subcmd == "info") {
      let celery = chain.find((c) => c.block.id == args[0]),
        celeryOwner = wallets.find((w) =>
          w.ownedCeleries.includes(parseInt(args[0]))
        ),
        ownerUser;

      try {
        ownerUser = await message.client.users.fetch(celeryOwner.id);
      } catch (e) {
        ownerUser = {
          username: "Unknown",
        };
      }

      if (!celery) {
        message.reply({
          content: "Celery with that id does not exist!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      let rarityString, rarityColor;

      switch (celery.block.rarity) {
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
        .setAuthor({ iconURL: message.guild.iconURL(), name: "NFCel" })
        .setColor(rarityColor)
        .setTitle(
          `${ownerUser.username}'s Celery of ${celery.displayName
            .split("")
            .map((c, i) => (i == 0 ? c.toUpperCase() : c))
            .join("")}`
        )
        .setThumbnail("https://imgur.com/IMe56Qq.png")
        .setDescription(
          `**ID:** #${celery.block.id}
**Name:** ${celery.block.name}
**Minted by:** <@${celery.block.minter}>
**Rarity:** ${rarityString} (${celery.block.rarity})
**Validation celeries:** ${JSON.stringify(
            celery.block.validationCeleries.map((v) => v.validity.slice(0, 3))
          )}
**Next minting requirement:** ${celery.block.mintReq}
**Hash:** ${celery.block.hash}
**Opensea NFT:** (🥥) https://www.youtube.com/watch?v=0iCtC-EOzEo`
        )
        .setFooter({
          text: `Current celery minting requirement: ${
            chain[chain.length - 1].block.mintReq
          }\nCurrent number of celeries in circulation: ${
            chain.length
          }\nLatest celery: #${chain[chain.length - 1].block.id}`,
        });

      message.reply({
        embeds: [embed],
        allowedMentions: {
          mentionedUser: false,
        },
      });
    } else if (subcmd == "list") {
      let user = wallets.find((w) => w.id == args[0]),
        userUser;

      try {
        userUser = await message.client.users.fetch(user.id);
      } catch (e) {
        message.reply({
          content: "User with that id does not exist!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      let embed = new Discord.MessageEmbed()
        .setAuthor({ iconURL: message.guild.iconURL(), name: "NFCel" })
        .setColor("#0099ff")
        .setTitle(`${userUser.username}'s Celery Wallet`)
        .setThumbnail("https://i.imgur.com/DyWSEbX.png")
        .setDescription(
          `${user.ownedCeleries
            .map(
              (id) =>
                `#${id} (${chain.find((c) => c.block.id == id).displayName})`
            )
            .join("\n")}`
        )
        .setFooter({
          text: `Current celery minting requirement: ${
            chain[chain.length - 1].block.mintReq
          }\nCurrent number of celeries in circulation: ${
            chain.length
          }\nLatest celery: #${chain[chain.length - 1].block.id}`,
        });

      message.reply({
        embeds: [embed],
        allowedMentions: {
          mentionedUser: false,
        },
      });
    } else if (subcmd == "exchange") {
      let celery = chain.find((c) => c.block.id == args[0]);
      if (!celery) {
        message.reply({
          content: "Celery with that id does not exist!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      let user = wallets.find((w) => w.id == message.author.id);
      if (!user) {
        message.reply({
          content: "You do not have a wallet!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      let botWallet = wallets.find((w) => w.id == client.user.id);
      if (!botWallet) {
        message.reply({
          content: "An internal error occurred!\nPlease try again later.",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      if (botWallet.ownedCeleries.includes(celery.block.id)) {
        message.reply({
          content: "This celery has already been exchanged!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      if (!user.ownedCeleries.includes(celery.block.id)) {
        message.reply({
          content: "You do not own this celery!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      // Put the celery in the bot's wallet
      // And remove it from the user's wallet
      let newWallets = wallets.map((w) => {
        if (w.id == user.id) {
          w.ownedCeleries = w.ownedCeleries.filter((c) => c != celery.block.id);
        }
        if (w.id == botWallet.id) {
          w.ownedCeleries.push(celery.block.id);
          // Filter to make sure there are no duplicate celeries
          w.ownedCeleries = [...new Set(w.ownedCeleries)];
        }
        return w;
      });

      // Update wallets
      chaindb.set("wallets", newWallets);

      let ccAmt;

      switch (celery.block.rarity) {
        case 1:
          ccAmt = 10;
          break;
        case 2:
          ccAmt = 20;
          break;
        case 3:
          ccAmt = 30;
          break;
        case 4:
          ccAmt = 40;
          break;
        default:
          ccAmt = 50 + 10 * celery.block.rarity;
          break;
      }

      unbClient
        .editUserBalance(message.guild.id, message.author.id, {
          cash: ccAmt,
          reason: `Celery exchange for celery #${celery.block.id} (${celery.displayName})`,
        })
        .catch((err) => {
          message.reply({
            content:
              "An internal error occurred!\nPlease try again later, the celery has been returned to your wallet.",
            allowedMentions: { mentionedUser: false },
          });
          // Put the celery back in the user's wallet
          // And remove it from the bot's wallet
          let newWallets = wallets.map((w) => {
            if (w.id == user.id) {
              w.ownedCeleries.push(celery.block.id);
            }
            if (w.id == botWallet.id) {
              w.ownedCeleries = w.ownedCeleries.filter(
                (c) => c != celery.block.id
              );
            }
            return w;
          });

          // Update wallets
          chaindb.set("wallets", newWallets);
        });

      let embed = new Discord.MessageEmbed()
        .setAuthor({ iconURL: message.guild.iconURL(), name: "NFCel" })
        .setColor("#0099ff")
        .setTitle(`${message.author.username}'s Celery Exchange`)
        .setDescription(
          `#${celery.block.id} (${
            celery.displayName
          }) exchanged for ${ccAmt} Cookies!
          ${
            celery.block.rarity >= 3
              ? '\nPsst! \nYou can also exchange your celery for a **real** "Bored Celery Sail Club" NFT on DrySea!\n' +
                "**[Click here to exchange](https://aunft.spuun.art)** to get a legendary celery!"
              : ""
          }`
        )
        .setThumbnail("https://i.imgur.com/et8ot4K.png")
        .setFooter({
          text: `Current celery minting requirement: ${
            chain[chain.length - 1].block.mintReq
          }\nCurrent number of celeries in circulation: ${
            chain.length
          }\nLatest celery: #${chain[chain.length - 1].block.id}`,
        });

      message.reply({
        embeds: [embed],
        allowedMentions: {
          mentionedUser: false,
        },
      });
    } else if (subcmd == "give") {
      let toUser = wallets.find((w) => w.id == args[0]);
      if (!toUser) {
        message.reply({
          content: "That user does not have a wallet!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      let fromUser = wallets.find((w) => w.id == message.author.id);
      if (!fromUser) {
        message.reply({
          content: "You do not have a wallet!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      let celery = chain.find((c) => c.block.id == args[1]);
      if (!celery) {
        message.reply({
          content: "That celery does not exist!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      if (!fromUser.ownedCeleries.includes(celery.id)) {
        message.reply({
          content: "You do not own this celery!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      let newWallets = wallets.map((w) => {
        if (w.id == fromUser.id) {
          w.ownedCeleries = w.ownedCeleries.filter((c) => c != celery.block.id);
        }
        if (w.id == toUser.id) {
          w.ownedCeleries.push(celery.block.id);
        }
        return w;
      });

      // Update wallets
      chaindb.set("wallets", newWallets);

      let embed = new Discord.MessageEmbed()
        .setAuthor({ iconURL: message.guild.iconURL(), name: "NFCel" })
        .setColor("#0099ff")
        .setTitle(`${message.author.tag}'s Celery Exchange`)
        .setDescription(
          `#${celery.block.id} (${celery.displayName}) has been given to ${toUser.id}!`
        )
        .setThumbnail("https://i.imgur.com/et8ot4K.png")
        .setFooter({
          text: `Current celery minting requirement: ${
            chain[chain.length - 1].block.mintReq
          }\nCurrent number of celeries in circulation: ${
            chain.length
          }\nLatest celery: #${chain[chain.length - 1].block.id}`,
        });

      message.reply({
        embeds: [embed],
        allowedMentions: {
          mentionedUser: false,
        },
      });
    } else if (subcmd == "rename") {
      let celery = chain.find((c) => c.block.id == args[0]);
      if (!celery) {
        message.reply({
          content: "That celery does not exist!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      let fromUser = wallets.find((w) => w.id == message.author.id);
      if (!fromUser) {
        message.reply({
          content: "You do not have a wallet!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      if (!fromUser.ownedCeleries.includes(celery.block.id)) {
        message.reply({
          content: "You do not own this celery!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      // Check if user has enough cookies
      let { User } = require("unb-api"),
        /** @type {User} */
        ccAmt;

      try {
        ccAmt = await unbClient.getUserBalance(
          message.guild.id,
          message.author.id
        );
      } catch (err) {
        message.reply({
          content: "An internal error occurred!\nPlease try again later.",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      if (ccAmt.cash + ccAmt.bank < 10) {
        message.reply({
          content: "You do not have enough cookies!",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      celery.displayName = args.slice(1).join(" ");

      let newChain = chain.map((c) => {
        if (c.block.id == celery.block.id) c.displayName = celery.displayName;
        return c;
      });

      // Update chain
      chaindb.set("chain", newChain);

      // Subtract a total of 10 cookies from both the bank and the user's cash
      if (ccAmt.cash < 10)
        unbClient.editUserBalance(message.guild.id, message.author.id, {
          cash: ccAmt.cash * -1,
          bank: ccAmt.cash - 10,
          reason: "Celery rename",
        });
      else
        unbClient.editUserBalance(message.guild.id, message.author.id, {
          cash: ccAmt.cash * -1,
          reason: "Celery rename",
        });

      let embed = new Discord.MessageEmbed()
        .setAuthor({ iconURL: message.guild.iconURL(), name: "NFCel" })
        .setColor("#0099ff")
        .setTitle(`${message.author.tag}'s Celery Rename`)
        .setDescription(
          `#${celery.block.id} (${celery.displayName}) has been renamed to ${celery.displayName}!
Do note that this only affects the display name metadata, and not the actual celery block.`
        )
        .setThumbnail("https://i.imgur.com/42DKz0B.png")
        .setFooter({
          text: `Current celery minting requirement: ${
            chain[chain.length - 1].block.mintReq
          }\nCurrent number of celeries in circulation: ${
            chain.length
          }\nLatest celery: #${chain[chain.length - 1].block.id}`,
        });

      message.reply({
        embeds: [embed],
        allowedMentions: {
          mentionedUser: false,
        },
      });
    } else if (subcmd == "dummy") {
      if (
        !(await message.member.fetch()).roles.cache.find((r) =>
          r.name.toLowerCase().includes("staff")
        )
      )
        return;

      // Create a dummy celery, AKA solo minted by the backend
      // First get all necessary validation celeries
      let latestCeleryBlock = chain[chain.length - 1],
        latestCelery = latestCeleryBlock.block,
        mintReq = latestCelery.mintReq,
        calculated = [];

      if (latestCeleryBlock.displayName == "dummy") {
        message.reply({
          content:
            "The latest celery is already a dummy celery!\nPlease wait for the next celery to be minted, or rename it.",
          allowedMentions: { mentionedUser: false },
        });
        return;
      }

      // Validate the celery
      while (calculated.length < mintReq) {
        function generate() {
          randControlled(0.5)
            ? calculated.push({
                celery: "🥬",
                validity: [0.5, true],
              })
            : generate();
        }
        generate();
      }

      // Create the celery
      let newCelery = {
        id: chain.length,
        name: "dummy",
        minter: message.author.id,
        rarity: calculated.length,
        validationCeleries: calculated,
        mintReq: mintReq,
        hash: undefined,
        previousCelery: crypto
          .createHash("sha256")
          .update(JSON.stringify(chain[chain.length - 1].block))
          .digest("hex"),
      };

      newCelery.hash = crypto
        .createHash("sha256")
        .update(
          crypto
            .createHash("sha256")
            .update(JSON.stringify(newCelery))
            .digest("hex") + newCelery.previousCelery
        )
        .digest("hex");

      // Add the minted celery to the chain
      chain.push({ block: newCelery, displayName: newCelery.name });

      // Update chain
      chaindb.set("chain", chain);

      // Add the celery to the wallet
      let newWallets = wallets.map((w) => {
        if (w.id == message.author.id) {
          w.ownedCeleries.push(newCelery.id);
        }
        return w;
      });

      // Update wallets
      chaindb.set("wallets", newWallets);

      message.reply({
        content: `A dummy celery has been minted, #${newCelery.id}, check your wallet!`,
        allowedMentions: {
          mentionedUser: false,
        },
      });
    }
  }
});
