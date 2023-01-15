import mongoose from "mongoose";

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
  count: number;
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
  count: {
    type: Number,
    default: 0,
  },
});

const Sector = mongoose.model<ISector>("Sector", sectorSchema);

export { Sector, ISector };
