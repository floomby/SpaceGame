import mongoose from "mongoose";
import { Faction } from "../src/defs";

interface IResourceDensity {
  resource: string;
  density: number;
}

const resourceDensitySchema = new mongoose.Schema<IResourceDensity>({
  resource: {
    type: String,
    required: true,
  },
  density: {
    type: Number,
    required: true,
    min: 0,
  },
});

interface ISector {
  id: number;
  resources: IResourceDensity[];
  asteroidCount: number;
  faction: Faction;
  guardianCount: number;
}

const sectorSchema = new mongoose.Schema<ISector>({
  id: {
    type: Number,
    required: true,
  },
  resources: {
    type: [resourceDensitySchema],
    default: [],
  },
  asteroidCount: {
    type: Number,
    default: 0,
  },
  faction: {
    type: Number,
    required: true,
    min: 0,
    max: 3,
    validate: {
      validator: Number.isInteger,
      message: "{VALUE} is not an integer value",
    }
  },
  guardianCount: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: "{VALUE} is not an integer value",
    }
  },
});

const Sector = mongoose.model<ISector>("Sector", sectorSchema);

export { Sector, ISector };
