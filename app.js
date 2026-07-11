//vivek email used for mogngodb
import express from "express";
import Data from "./data.js"
import { connectDb } from "./db.js";
import crypto from 'crypto';
import {writeFile} from "fs/promises"
import { mkdir } from "fs/promises";
await mkdir("./logs", { recursive: true });
const app = express();
const PORT = 4000;
const WACRM_WEBHOOK_SECRET = process.env.WACRM_WEBHOOK_SECRET
await connectDb();
app.use('/webhooks/flow', express.raw({ type: 'application/json' }));
app.use('/whatsapp/webhook', express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toLocaleString()} ${req.method} ${req.originalUrl}`);

  const bodyToLog = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;

  writeFile(
    `./logs/${Date.now()}-${crypto.randomUUID()}.json`,
    JSON.stringify(bodyToLog, null, 2)
  ).catch((err) => console.log("log write failed", err));

  next();
});

function deepFind(obj, targetKey) {
  if (!obj || typeof obj !== "object") return undefined;

  if (Object.prototype.hasOwnProperty.call(obj, targetKey) && obj[targetKey]) {
    return obj[targetKey];
  }

  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val && typeof val === "object") {
      const found = deepFind(val, targetKey);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});


app.post("/whatsapp/webhook", async (req, res) => {
  res.status(200).json({ message: "received" });

  try {
    const ctwaClid = deepFind(req.body, "ctwa_clid");
    if (!ctwaClid) return;

    const existing = await Data.findOne({ ctwaClid });
    if (existing) {
      console.log("clid already stored, skipping", ctwaClid);
      return;
    }

    const customerPhoneNumber = deepFind(req.body, "from");
    const businessPhoneNumber = deepFind(req.body, "display_phone_number");
    const businessPhoneNumberId = deepFind(req.body, "phone_number_id");
    const customerName = deepFind(req.body, "name");

    const savedData = await Data.create({
      ctwaClid,
      customerPhoneNumber,
      businessPhoneNumber,
      businessPhoneNumberId,
      name: customerName,
    });

    console.log("saved new clid", savedData._id);
  } catch (error) {
    if (error.code === 11000) {
      console.log("duplicate clid race, ignored");
    } else {
      console.log("webhook processing error", error);
    }
  }
});






const verifySignature = (rawBody, signature, secret) => {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return signature === expected;
};
const META_API_VERSION = "v21.0";
const META_DATASET_ID = process.env.META_DATASET_ID; // from Events Manager
const META_ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;

async function sendLeadEventToMeta(ctwaClid) {
  if (!ctwaClid) return;

  const body = {
    data: [
      {
        event_name: "Lead",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "business_messaging",
        messaging_channel: "whatsapp",
        user_data: { ctwa_clid: ctwaClid },
      },
    ],
  };

  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${META_DATASET_ID}/events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.log("Meta CAPI error:", res.status, text);
  } else {
    console.log("Meta CAPI Lead event sent for", ctwaClid);
  }
}



app.post('/webhooks/flow', async (req, res) => {
  console.log(req.body.toString('utf8'));
  const signature = req.headers['x-wacrm-signature'];

  if (!verifySignature(req.body, signature, WACRM_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(req.body);
  res.status(200).send('ok'); // ack quickly, then process

  try {
    const customerPhone = event?.customer?.phone_number;
    if (customerPhone) {
      const record = await Data.findOne({ customerPhoneNumber: customerPhone });
      if (record?.ctwaClid) {
        await sendLeadEventToMeta(record.ctwaClid);
      } else {
        console.log("no ctwa_clid on file for", customerPhone);
      }
    }
  } catch (err) {
    console.log("failed to send Meta Lead event", err);
  }
});

app.listen(PORT, () => {
  console.log(`Webhook listener running on port ${PORT}`);
});



