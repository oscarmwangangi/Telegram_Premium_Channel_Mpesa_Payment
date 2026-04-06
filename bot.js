const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// TEMP memory storage (no DB)
const users = {};

module.exports = { bot, users };

// Start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  users[chatId] = {};

  bot.sendMessage(chatId, `
Welcome 

Enter your phone number (e.g. 2547XXXXXXXX)
  `);
});

// Receive phone number
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (!users[chatId]) return;

  const text = msg.text;

  if (text.startsWith("254")) {
    users[chatId].phone = text;

    bot.sendMessage(chatId, `
📲 Sending M-Pesa request...
Check your phone and enter PIN
    `);

    // call STK
    const { sendSTK } = require('./mpesa');
    sendSTK(text, chatId);
  }
});