import express from "express";
import { connectDb } from "./db";
const app = express();
const PORT = 4000;

await connectDb();
app.use(express.json());

app.use((req, res, next) => {
  console.log(
    `${new Date().toLocaleString()} ${req.method} ${req.originalUrl}`,
  );
  next();
});

const data = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "1332147361792917",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "917460939319",
              phone_number_id: "1227817583742974",
            },
            contacts: [
              {
                profile: {
                  name: "Nitin Rai",
                },
                wa_id: "919198080864",
                user_id: "IN.998924883032154",
              },
            ],
            messages: [
              {
                referral: {
                  source_url: "https://www.instagram.com/p/DafTCG-she4/",
                  source_id: "120249582958870276",
                  source_type: "ad",
                  body: "🎬 Hiring Video Editor – Lucknow (On-Site)\n\nLooking for a skilled Video Editor with 2+ years of experience.\n\nMust know:\n• Premiere Pro\n• After Effects\n• Photoshop\n• DaVinci Resolve\n\nFull-Time Role\nImmediate Joining\nCompetitive Salary\n\n📲 Send your portfolio on WhatsApp.",
                  headline: "Chat with us",
                  media_type: "image",
                  image_url:
                    "https://scontent.xx.fbcdn.net/v/t45.1600-4/735504423_122115585003125268_3741890208333037724_n.png?stp=c3.41.300.300a_dst-png_p306x306&_nc_cat=103&ccb=1-7&_nc_sid=e37a05&_nc_ohc=juVLPDw6w5wQ7kNvwHh3LA0&_nc_oc=Adqe25Oz3ztYYQXLvsjIkyCnQ4yf9cvsA8jg9pSA-GJ4-7-p784nNijrGh6VhggRKivZKwyKnek0GikdRl3Ne86e&_nc_ad=z-m&_nc_cid=0&_nc_zt=1&_nc_ht=scontent.xx&_nc_gid=WNfBwAWlyVX4nmP8s7LvSg&oh=00_AQBNxq5ysei3U0LndDYRiNVZ32B_0T0ybPh9AlXQPGJCTQ&oe=6A52F609",
                  ctwa_clid:
                    "AfilQJAZ61qUAF4N07ntEIR3ojGN0mDykvHP4SjOrDNOP65pf4FzwaZwFf_VxeKO0PcqGRixn1-Aphi_8EX6-AmbCGq9b68bvs3kpfMRUU6s6ez7YzASJycoDqof6Q9ZuIQJiyJ3gck",
                  welcome_message: {
                    text: "Hi! Please let us know how we can help you.",
                  },
                },
                from: "919198080864",
                from_user_id: "IN.998924883032154",
                id: "wamid.HBgMOTE5MTk4MDgwODY0FQIAEhgUM0E2MzkwNkYyMTM5N0NFMkIzM0EA",
                timestamp: "1783439974",
                text: {
                  body: "Hello, I'm interested in the Video Editor job position.",
                },
                type: "text",
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
};

app.post("/whatsapp/webhook", (req, res, next) => {
  try {
    if (ctwaClid) {
      return res.status(200).json({ message: "got clid" });
    } else {
      return res.status(201).json({ message: "no clid" });
    }
    const ctwaClid =
      data.entry[0].changes[0].value.messages[0].referral.ctwa_clid;

    const customerPhoneNumber = data.entry[0].changes[0].value.messages[0].from;
    const buisnessPhoneNumber =
      data.entry[0].changes[0].value.metadata.display_phone_number;
    const buisnessPhoneNumberId =
      data.entry[0].changes[0].value.metadata.phone_number_id;
  } catch (error) {
    console.log(error);
  }
});

app.listen(PORT, () => {
  console.log("Server started");
});
