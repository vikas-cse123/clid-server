//vivek email used for mogngodb
import express from "express";
import Data from "./data.js"
import { connectDb } from "./db.js";
import crypto from 'crypto';
import {writeFile} from "fs/promises"
import { mkdir } from "fs/promises";
import { credentials } from "./credentials.js";
await mkdir("./logs", { recursive: true });
const app = express();
const PORT = 4000;
const WACRM_WEBHOOK_SECRET = process.env.WACRM_WEBHOOK_SECRET
await connectDb();
app.use('/webhooks/flow', express.raw({ type: 'application/json' }));
app.use('/whatsapp/webhook', express.json());

app.use((req, res, next) => {

  console.log(
  `${new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "short",
    timeStyle: "medium",
    hour12: true,
  })} ${req.method} ${req.originalUrl}`
);
  if(req.method === "POST"){
    const bodyToLog = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;

  writeFile(
    `./logs/${Date.now()}-${crypto.randomUUID()}.json`,
    JSON.stringify(bodyToLog, null, 2)
  ).catch((err) => console.log("log write failed", err));
  }



  next();
});
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export function deepFind(obj, targetKey) {
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

const META_GRAPH_VERSION = "v25.0";
//Save clid to db 
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

      const referral = deepFind(req.body, "referral") || {};
        const wabaId = deepFind(req.body, "entry")?.[0]?.id;
        const firstMessage = deepFind(req.body, "text")?.body;
        const wamid = deepFind(req.body, "messages")?.[0]?.id;

    const savedData = await Data.create({
      ctwaClid,
      customerPhoneNumber,
      businessPhoneNumber,
      businessPhoneNumberId,
      name: customerName,
      wabaId,
      firstMessage,
      wamid,
      adId: referral.source_id,
      adSourceUrl: referral.source_url,
      adSourceType: referral.source_type,
      adHeadline: referral.headline,
      adBody: referral.body,
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



function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value).trim().toLowerCase())
    .digest("hex");
}

function normalizePhone(phone) {
  let p = String(phone || "").replace(/\D/g, "");

  // India fallback: 9876543210 => 919876543210
  if (p.length === 10) {
    p = `91${p}`;
  }

  return p;
}

export async function sendLeadEventToMeta({
  phone,
  ctwa_clid,
  eventName = "LeadSubmitted",
  eventId,
  value = 1,
  leadStage = "qualified_lead",
  META_DATASET_ID,
  META_WABA_ID,
  META_ACCESS_TOKEN
}) {
  if (!META_DATASET_ID) {
    throw new Error("META_DATASET_ID missing in .env");
  }

  if (!META_WABA_ID) {
    throw new Error("META_WABA_ID missing in .env");
  }

  if (!META_ACCESS_TOKEN) {
    throw new Error("META_ACCESS_TOKEN missing in .env");
  }

  if (!phone) {
    throw new Error("phone missing");
  }

  if (!ctwa_clid) {
    throw new Error("ctwa_clid missing");
  }

  const normalizedPhone = normalizePhone(phone);

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),

    action_source: "business_messaging",
    messaging_channel: "whatsapp",

    user_data: {
      whatsapp_business_account_id: META_WABA_ID,

      // raw, do not hash
      ctwa_clid,

      // hashed phone
      ph: sha256(normalizedPhone),
    },

    custom_data: {
      currency: "INR",
      value,
      lead_stage: leadStage,
    },
  };

  // Optional: only send event_id if you pass it.
  // Meta dedups on (event_name + event_id); the Mongo doc _id is unique per
  // lead, so this makes the send idempotent. Cast to string for a clean payload.
  if (eventId) {
    event.event_id = String(eventId);
  }

  const payload = {
    data: [event],
  };


  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${META_DATASET_ID}/events?access_token=${META_ACCESS_TOKEN}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${META_ACCESS_TOKEN}`
    },
    body: JSON.stringify(payload),
  });
  console.log("Response meta");
  console.log(response);

  const result = await response.json();


  console.log("Meta result:");
  console.log(JSON.stringify(result, null, 2));

  if (!response.ok || result.error) {
    throw new Error(`Meta CAPI error: ${JSON.stringify(result)}`);
  }

  return {...result,status:response.status};
}



const verifySignature = (rawBody, signature, secret) => {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  return signature === expected;
};




app.post('/webhooks/flow', async (req, res) => {
  
  const signature = req.headers['x-wacrm-signature'];

  if (!verifySignature(req.body, signature, WACRM_WEBHOOK_SECRET)) {
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(req.body);



 
  
  res.status(200).send('ok'); // ack quickly, then process

  try {
    const customerPhone = event?.customer?.phone_number;
    const businessPhoneNumberId = event?.business?.phone_number_id
    const config = credentials[businessPhoneNumberId]
    console.log({config});
    if (customerPhone) {
      const record = await Data.findOne({ customerPhoneNumber: customerPhone,businessPhoneNumberId:businessPhoneNumberId });
      console.log({record});
     if (record?.ctwaClid) {
        if (record.isClidSend) {
          console.log("clid already sent to Meta, skipping", record.ctwaClid);
          return;
        }
        await sendLeadEventToMeta({
          ctwa_clid: record.ctwaClid,
          phone: record.customerPhoneNumber,
          eventId: record._id,
          META_ACCESS_TOKEN:config.META_ACCESS_TOKEN,
          META_WABA_ID:config.META_WABA_ID,
          META_DATASET_ID:config.META_DATASET_ID
          
        });
        // only mark sent after a successful send; a throw above leaves it false so it retries
        record.isClidSend = true;
        await record.save();
        console.log("marked isClidSend=true for", record._id);
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



