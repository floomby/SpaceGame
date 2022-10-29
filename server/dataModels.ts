import mongoose, { SchemaType } from "mongoose";

const Schema = mongoose.Schema;

const userSchema = new Schema({
  name: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  id: { type: Number, required: true, unique: true },
  faction: { type: Number, required: true },
});

const User = mongoose.model("User", userSchema);

const positionSchema = new Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
});

const stationSchema = new Schema({
  name: { type: String, required: true },
  id: { type: Number, required: true },
  sector: { type: Number, required: true },
  definitionIndex: { type: Number, required: true },
  position: { type: positionSchema, required: true },
  team: { type: Number, required: true },
  shipsAvailable: { type: [String], required: true },
});

const Station = mongoose.model("Station", stationSchema);

// I may want a schema for the the Player type from src/game.ts but for now I am just using serialization
const checkpointSchema = new Schema({
  id: { type: Number, required: true },
  sector: { type: Number, required: true },
  data: { type: String, required: true },
});

const Checkpoint = mongoose.model("Checkpoint", checkpointSchema);

export { User, Station, Checkpoint };
