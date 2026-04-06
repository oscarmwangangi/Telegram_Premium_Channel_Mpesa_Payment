const axios = require("axios");
require('dotenv').config();

async function createInviteLink() {
  const res = await axios.post(
    `https://api.telegram.org/bot${process.env.BOT_TOKEN}/createChatInviteLink`,
    {
      chat_id: process.env.CHANNEL_USERNAME,
      member_limit: 1,   // 🔥 only 1 person can use
      expire_date: Math.floor(Date.now() / 1000) + 300 // 5 mins expiry
    }
  );

  return res.data.result.invite_link;
}
module.exports = createInviteLink;


