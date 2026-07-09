import mongoose from "mongoose";
const dataSchema = new mongoose.Schema(
  {
    customerPhoneNumber: {
      type: String,
      required: true,
    },
    buisnessPhoneNumber: {
      type: String,
      required: true,
    },
    buisnessPhoneNumberId: {
      type: String,
    },
  },
  {
    strict: false,
    timestamps: true,
  },
);

const Data = mongoose.model("data", dataSchema);
export default Data;
