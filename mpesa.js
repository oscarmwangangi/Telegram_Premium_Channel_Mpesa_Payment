const axios = require('axios');
require('dotenv').config();
const { bot } = require('./bot');

// Generate access token
async function getAccessToken() {
  const url = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

  const auth = Buffer.from(
    process.env.CONSUMER_KEY + ":" + process.env.CONSUMER_SECRET
  ).toString("base64");

  const res = await axios.get(url, {
    headers: { Authorization: `Basic ${auth}` }
  });
console.log(res.data.access_token);
  return res.data.access_token;
  
}

// Send STK push
async function sendSTK(phone, chatId) {
  const token = await getAccessToken();

  const timestamp = new Date().toISOString().replace(/[-T:\.Z]/g, "").slice(0,14);
  const password = Buffer.from(
    process.env.SHORTCODE + process.env.PASSKEY + timestamp
  ).toString("base64");

  await axios.post(
    "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    {
      BusinessShortCode: process.env.SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: "1",
      PartyA: phone,
      PartyB: process.env.SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: process.env.CALLBACK_URL,
      AccountReference: "Telegram",
      TransactionDesc: "Channel Access"
    },
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
}

module.exports = { sendSTK };