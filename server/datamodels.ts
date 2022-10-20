import mongoose from "mongoose";

const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: String,
  password: String,
  id: Number,
  faction: Number,
});

const User = mongoose.model("User", userSchema);

export { User };
