import mongoose, { SchemaType } from "mongoose";
import { armDefMap, defMap, Faction } from "../src/defs";
import { recipeMap } from "../src/recipes";

const Schema = mongoose.Schema;

interface IInventoryEntry {
  what: string;
  amount: number;
}

const inventorySchema = new Schema<IInventoryEntry>({
  what: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: "{VALUE} is not an integer value",
    },
  },
});

interface IUser {
  name: string;
  password: string;
  id: number;
  faction: Faction;
  inventory: IInventoryEntry[];
  recipesKnown: string[];
  sectorsVisited: number[];
  loginCount: number;
  loginTimes: Date[];
  logoffTimes: Date[];
  friends: number[];
}

const userSchema = new Schema<IUser>({
  name: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  id: {
    type: Number,
    required: true,
    unique: true,
    validate: {
      validator: Number.isInteger,
      message: "{VALUE} is not an integer value",
    },
  },
  faction: {
    type: Number,
    required: true,
    min: 0,
    max: 2,
    validate: {
      validator: Number.isInteger,
      message: "{VALUE} is not an integer value",
    },
  },
  // TODO I should put validation of the uniqueness of keys in the inventory.
  // MongoDB does not appear to support this, but I have ideas for how to do it anyways.
  inventory: [inventorySchema],
  recipesKnown: {
    type: [String],
    validate: {
      validator: (v: string[]) => v.every((item) => recipeMap.has(item)),
      message: (props) => `${props.value} is not a valid recipe`,
    },
  },
  sectorsVisited: {
    type: [Number],
    default: [],
  },
  loginCount: {
    type: Number,
    required: false,
    default: 0,
    validate: {
      validator: Number.isInteger,
      message: "{VALUE} is not an integer value",
    },
  },
  loginTimes: {
    type: [Date],
    required: false,
    default: [],
    validate: {
      validator: (v: Date[]) => v.every((item) => item instanceof Date),
      message: (props) => `${props.value} is not a valid date`,
    },
  },
  logoffTimes: {
    type: [Date],
    required: false,
    default: [],
    validate: {
      validator: (v: Date[]) => v.every((item) => item instanceof Date),
      message: (props) => `${props.value} is not a valid date`,
    },
  },
  friends: {
    type: [Number],
    default: [],
  },
});

const User = mongoose.model("User", userSchema);

const positionSchema = new Schema({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
});

const stationSchema = new Schema({
  name: { type: String, required: true },
  id: {
    type: Number,
    required: true,
    validate: {
      validator: Number.isInteger,
      message: "{VALUE} is not an integer value",
    },
  },
  sector: { type: Number, required: true },
  definitionIndex: { type: Number, required: true },
  position: { type: positionSchema, required: true },
  team: {
    type: Number,
    required: true,
    min: 0,
    max: 2,
    validate: {
      validator: Number.isInteger,
      message: "{VALUE} is not an integer value",
    },
  },
  shipsAvailable: { type: [String], required: true },
});

const Station = mongoose.model("Station", stationSchema);

// I may want a schema for the the Player type from src/game.ts but for now I am just using serialization
const checkpointSchema = new Schema({
  id: {
    type: Number,
    required: true,
    validate: {
      validator: Number.isInteger,
      message: "{VALUE} is not an integer value",
    },
  },
  sector: { type: Number, required: true },
  data: { type: String, required: true },
});

const Checkpoint = mongoose.model("Checkpoint", checkpointSchema);

export { User, Station, Checkpoint, IUser };
