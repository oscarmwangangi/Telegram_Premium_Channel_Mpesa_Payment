const express = require('express');
const bodyParser = require('body-parser');
const { bot, users } = require('./bot');
require('dotenv').config();
const createInviteLink = require ('./inviteLink')
const axios = require("axios");

const app = express();
app.use(bodyParser.json());
 


// M-Pesa callback
app.post('/callback', async (req, res) => {
  const data = req.body;
    const link = await createInviteLink()
    console.log("Callback received:", data);
    const resultCode = data.Body.stkCallback.ResultCode;

  if (resultCode === 0) {
    // SUCCESS

    const metadata = data.Body.stkCallback.CallbackMetadata.Item;

    const phone = metadata.find(i => i.Name === "PhoneNumber").Value;

    // find user by phone
    const user = Object.keys(users).find(
      key => users[key].phone == phone
    );

    if (user) {
      bot.sendMessage(user, `
        ✅ Payment Successful!

        🎉 Welcome to Premium ${process.env.CHANNEL_NAME} channel

        Join here:
       ${link}
            `);
            }
        }

        res.sendStatus(200);
        });

app.listen(process.env.PORT, () => {
  console.log("Server running...");
});